import { existsSync } from 'node:fs'

import { Article, ArticleStatus, Book, BookStatus } from '@toutiao-flow/db'

import { AiPageAdapter } from '../ai/adapter.js'
import { getEngine } from '../ai/helper.js'
import { generateArticle } from '../ai/logics/generate-article.js'
import { isOverviewJson, type OverviewJson } from '../types/overview.js'
import { browserQueue } from '../utils/browser-queue.js'
import { prisma } from '../utils/db.js'
import BaseRole from '../utils/role/base.js'
import { ROLE_PRIORITY } from '../utils/role-priority.js'

import type { Ai } from '../ai/types.js'

type ArticleWithBook = Article & { book: Book }

/** 生成过程中维护的本地状态（与 DB 中的 attempts 同步） */
interface GenerateState {
  attempts: number
}

export default class ArticleRole extends BaseRole {
  cron = '* * * * * ?'
  waitPrevious = true
  priority = ROLE_PRIORITY.ARTICLE

  async run(): Promise<void> {
    const article = await prisma.article.findFirst({
      where: {
        status: ArticleStatus.READY,
        book: { status: BookStatus.PROCESSING },
      },
      orderBy: [{ book: { createdAt: 'asc' } }, { index: 'asc' }],
      include: { book: true },
    })
    if (!article) return

    const { book } = article
    const attempts = article.attempts

    const overview = book.overview
    if (!isOverviewJson(overview)) {
      await this.markFailed(article.id, '概览 JSON 非法，无法生成成稿')
      return
    }

    if (!existsSync(book.path)) {
      await this.markFailed(article.id, `书籍文件不存在: ${book.path}`)
      return
    }

    if (!overview.articlePlan.some((item) => item.no === article.index)) {
      await this.markFailed(article.id, `概览 articlePlan 中缺少第 ${article.index} 篇`)
      return
    }

    console.log(
      `[article] 开始生成成稿: book.id=${book.id}, 第${article.index}篇, 已失败=${attempts} 次（不设上限）`,
    )

    const state: GenerateState = { attempts }

    try {
      await browserQueue.run(
        `article:${book.id}:${article.index}`,
        async () => {
          // 只按书籍格式选引擎：成稿不复用概览会话，避免同书多篇上下文互相干扰
          const engine = await getEngine({ ext: book.path })
          if (!engine) {
            await this.markFailed(article.id, `不支持的书籍格式: ${book.path}`)
            return
          }

          const ai = new AiPageAdapter(engine)
          try {
            await this.generateArticle(ai, article, book, overview, state)
          } finally {
            await ai.release()
          }
        },
        this.priority,
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(`[article] 生成异常: book.id=${book.id}, 第${article.index}篇: ${reason}`)
      await this.recordFailure(article.id, state.attempts, `生成异常：${reason}`)
    }
  }

  private async generateArticle(
    ai: Ai,
    article: ArticleWithBook,
    book: Book,
    overview: OverviewJson,
    state: GenerateState,
  ): Promise<void> {
    const { data, sessionUrl } = await generateArticle(ai, {
      bookPath: book.path,
      overview,
      index: article.index,
      onViolation: async (info) => {
        state.attempts = await this.recordFailure(
          article.id,
          state.attempts,
          info.violations.join('；'),
        )
      },
    })

    await prisma.article.update({
      where: { id: article.id },
      data: {
        data,
        status: ArticleStatus.DATA_DONE,
        attempts: 0,
        lastError: null,
        sessionUrl,
      },
    })

    console.log(
      `[article] 成稿完成: book.id=${book.id}, 第${article.index}篇, 失败尝试=${state.attempts}`,
    )
  }

  /** attempts+1，仅用于观测；不设上限，不会因次数置 FAILED */
  private async recordFailure(
    articleId: string,
    attempts: number,
    reason: string,
  ): Promise<number> {
    const next = attempts + 1

    await prisma.article.update({
      where: { id: articleId },
      data: {
        attempts: next,
        lastError: reason.slice(0, 2000),
      },
    })

    console.error(`[article] 第 ${next} 次尝试失败（不设上限）: ${reason}`)
    return next
  }

  /** 永久性失败：直接置 FAILED，不消耗重试次数 */
  private async markFailed(articleId: string, reason: string): Promise<void> {
    await prisma.article.update({
      where: { id: articleId },
      data: {
        status: ArticleStatus.FAILED,
        lastError: reason.slice(0, 2000),
      },
    })
    console.error(`[article] 标记 FAILED: ${reason}`)
  }
}
