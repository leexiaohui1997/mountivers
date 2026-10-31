import { existsSync } from 'node:fs'

import { Article, ArticleStatus, Book, BookStatus } from '@toutiao-flow/db'

import { isArticleJson, type ArticleJson } from '../types/article.js'
import {
  buildArticleImageSpecs,
  findMissingImageSpecs,
  withImagePath,
  withImagePrompt,
  type ArticleImageSpec,
} from '../utils/article-image-plan.js'
import { browserQueue } from '../utils/browser-queue.js'
import { prisma } from '../utils/db.js'
import { IMAGE_DOWNLOAD_DIR } from '../utils/env.js'
import { runImageTasks, type ImageTask, type ImageTaskResult } from '../utils/image-runner.js'
import BaseRole from '../utils/role/base.js'
import { ROLE_PRIORITY } from '../utils/role-priority.js'

type ArticleWithBook = Article & { book: Book }

/** 已提示过“合集封面未就绪”的书籍，避免每秒重复刷日志 */
const warnedMissingCover = new Set<string>()

/** 生成过程中维护的最新稿件数据（路径/提示词回写都基于它） */
interface ArticleDataState {
  data: ArticleJson
}

export default class ArticleImageRole extends BaseRole {
  cron = '* * * * * ?'
  waitPrevious = true
  priority = ROLE_PRIORITY.ARTICLE_IMAGE

  async run(): Promise<void> {
    const article = await prisma.article.findFirst({
      where: {
        status: ArticleStatus.DATA_DONE,
        // 前置条件：所属书籍的头条合集封面已生成
        book: { status: BookStatus.PROCESSING, toutiaoCoverPath: { not: null } },
      },
      orderBy: [{ book: { createdAt: 'asc' } }, { index: 'asc' }],
      include: { book: true },
    })
    if (!article) return

    const { book } = article
    if (!book.toutiaoCoverPath || !existsSync(book.toutiaoCoverPath)) {
      if (!warnedMissingCover.has(book.id)) {
        warnedMissingCover.add(book.id)
        console.log(
          `[article-image] 跳过：合集头条封面尚未生成或文件缺失 (book.id=${book.id}, path=${book.toutiaoCoverPath ?? 'null'})`,
        )
      }
      return
    }

    if (!isArticleJson(article.data)) {
      await this.markImageFailed(article.id, '成稿 data 非法，无法生成配图')
      return
    }

    const initialData = article.data
    const specs = buildArticleImageSpecs(initialData, book.id, article.index, IMAGE_DOWNLOAD_DIR)
    const missing = findMissingImageSpecs(specs, initialData, existsSync)

    // 图片其实已齐备（例如写完最后一张但状态没更新）：直接推进状态，不再开浏览器
    if (!missing.length) {
      await this.markImageDone(article.id)
      console.log(
        `[article-image] 图片已齐备: book.id=${book.id}, 第${article.index}篇 → ${ArticleStatus.IMAGE_DONE}`,
      )
      return
    }

    console.log(
      `[article-image] 开始: book.id=${book.id}, 第${article.index}篇, 缺 ${missing.length} 张: ${missing.map((spec) => spec.label).join(', ')}`,
    )

    const state: ArticleDataState = { data: initialData }
    const tasks = missing.map((spec) => this.buildTask(article, book, spec, state))

    let results: ImageTaskResult[]
    try {
      results = await browserQueue.run(
        `article-images:${book.id}:${article.index}`,
        async () => {
          return await runImageTasks(tasks)
        },
        this.priority,
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(`[article-image] 生成异常: book.id=${book.id}, 第${article.index}篇: ${reason}`)
      await this.recordFailure(article.id, article.imageAttempts, `生成异常：${reason}`)
      return
    }

    const remaining = findMissingImageSpecs(specs, state.data, existsSync)
    if (!remaining.length) {
      await this.markImageDone(article.id)
      console.log(
        `[article-image] 完成: book.id=${book.id}, 第${article.index}篇, 生成 ${missing.length} 张 → ${ArticleStatus.IMAGE_DONE}`,
      )
      return
    }

    const failedLabels = results.filter((result) => !result.passed).map((result) => result.label)
    const reason =
      failedLabels.length > 0
        ? `以下图片生成失败：${failedLabels.join('、')}`
        : `仍有 ${remaining.length} 张图片缺失：${remaining.map((spec) => spec.label).join('、')}`
    await this.recordFailure(article.id, article.imageAttempts, reason)
    console.log(
      `[article-image] 未完成: book.id=${book.id}, 第${article.index}篇, 剩余 ${remaining.length} 张`,
    )
  }

  private buildTask(
    article: ArticleWithBook,
    book: Book,
    spec: ArticleImageSpec,
    state: ArticleDataState,
  ): ImageTask {
    return {
      label: spec.label,
      prompt: () => spec.prompt,
      outputPath: () => spec.outputPath,
      attachPath: () => this.resolveAttachPath(spec, book, state),
      sessionUrl: () => article.sessionUrl ?? book.sessionUrl,
      onPromptFixed: async (fixedPrompt) => {
        state.data = withImagePrompt(state.data, spec, fixedPrompt)
        await prisma.article.update({
          where: { id: article.id },
          data: { data: state.data },
        })
        console.log(
          `[article-image] 提示词已回写: book.id=${book.id}, 第${article.index}篇, ${spec.label}`,
        )
      },
      onResult: async (filePath, tx) => {
        state.data = withImagePath(state.data, spec, filePath)
        await tx.article.update({
          where: { id: article.id },
          data: { data: state.data },
        })
        console.log(
          `[article-image] 落盘: book.id=${book.id}, 第${article.index}篇, ${spec.label} → ${filePath}`,
        )
      },
    }
  }

  /** 参考图：成稿封面用合集封面，B站封面用成稿封面，插图不用参考图 */
  private resolveAttachPath(
    spec: ArticleImageSpec,
    book: Book,
    state: ArticleDataState,
  ): string | null {
    if (spec.kind === 'cover') return this.existingPath(book.toutiaoCoverPath)
    if (spec.kind === 'bilibili-cover') return this.existingPath(state.data.cover)
    return null
  }

  private existingPath(filePath: string | null | undefined): string | null {
    return filePath && existsSync(filePath) ? filePath : null
  }

  private async markImageDone(articleId: string): Promise<void> {
    await prisma.article.update({
      where: { id: articleId },
      data: {
        status: ArticleStatus.IMAGE_DONE,
        imageAttempts: 0,
        imageLastError: null,
      },
    })
  }

  /** 配图轮次失败 +1，仅用于观测；不设上限，会一直重试到全部生成 */
  private async recordFailure(articleId: string, attempts: number, reason: string): Promise<void> {
    const next = attempts + 1

    await prisma.article.update({
      where: { id: articleId },
      data: {
        imageAttempts: next,
        imageLastError: reason.slice(0, 2000),
      },
    })

    console.error(`[article-image] 第 ${next} 轮失败（不设上限）: ${reason}`)
  }

  /** 永久性失败：直接置 IMAGE_FAILED */
  private async markImageFailed(articleId: string, reason: string): Promise<void> {
    await prisma.article.update({
      where: { id: articleId },
      data: {
        status: ArticleStatus.IMAGE_FAILED,
        imageLastError: reason.slice(0, 2000),
      },
    })
    console.error(`[article-image] 标记 IMAGE_FAILED: ${reason}`)
  }
}
