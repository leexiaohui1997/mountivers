import { existsSync } from 'node:fs'

import { Article, ArticleStatus, Book, BookStatus } from '@toutiao-flow/db'
import { Page } from 'playwright'

import YuanBaoPage from '../browser-pages/yuanbao.js'
import { isArticleJson, type ArticleJson } from '../types/article.js'
import { isOverviewJson, type OverviewJson } from '../types/overview.js'
import { validateArticle } from '../utils/article-validator.js'
import { attachToFile } from '../utils/attach.js'
import { browserQueue } from '../utils/browser-queue.js'
import { getPage, releasePage } from '../utils/browser.js'
import { prisma } from '../utils/db.js'
import { extractJsonBlock } from '../utils/markdown.js'
import BaseRole from '../utils/role/base.js'
import { renderTemplate, renderToAttach } from '../utils/template.js'
import { WORD_THRESHOLD } from '../utils/word-count.js'

/** 角色专用的元宝标签页 */
const ARTICLE_PAGE_ID = 'article-yuanbao'

type ArticleWithBook = Article & { book: Book }

/** 生成过程中维护的本地状态（与 DB 中的 attempts 同步） */
interface GenerateState {
  attempts: number
}

export default class ArticleRole extends BaseRole {
  cron = '* * * * * ?'
  waitPrevious = true

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
      await browserQueue.run(`article:${book.id}:${article.index}`, async () => {
        const page = await getPage(ARTICLE_PAGE_ID)
        try {
          await this.generateArticle(page, article, book, overview, state)
        } finally {
          await releasePage(page)
        }
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(`[article] 生成异常: book.id=${book.id}, 第${article.index}篇: ${reason}`)
      await this.recordFailure(article.id, state.attempts, `生成异常：${reason}`)
    }
  }

  private async generateArticle(
    page: Page,
    article: ArticleWithBook,
    book: Book,
    overview: OverviewJson,
    state: GenerateState,
  ): Promise<void> {
    const $page = new YuanBaoPage(page)
    // 每篇都开新会话，避免上一篇的上下文干扰
    await $page.newSession()
    await $page.clearEditor()

    const bookFile = await attachToFile({ type: 'file', path: book.path })
    const overviewFile = await attachToFile({
      type: 'markdown',
      filename: 'overview.json',
      content: JSON.stringify(overview, null, 2),
    })
    const promptFile = await renderToAttach('article.prompt', '成稿编写提示词.md')

    await $page.uploadFile(bookFile)
    await $page.uploadFile(overviewFile)
    await $page.uploadFile(promptFile)

    await $page.input(`按提示词为第${article.index}篇撰写成稿 article，以 json 代码块的格式回复`)
    await $page.send()

    while (true) {
      const answer = await $page.getAnswer()
      const json = extractJsonBlock(answer)

      if (!json) {
        await this.handleFailure($page, article.id, state, ['AI 回复中没有找到 json 代码块。'], {
          needExpand: false,
          wordCount: 0,
          jsonQuoteHint: true,
        })
        continue
      }

      let detail = ''
      if (!isArticleJson(json, (reason) => (detail = reason))) {
        await this.handleFailure(
          $page,
          article.id,
          state,
          [`article JSON 结构不符合 schema：\n${detail}`],
          {
            needExpand: false,
            wordCount: 0,
            jsonQuoteHint: true,
          },
        )
        continue
      }

      // no 以数据库篇号为准，避免模型写错导致无意义重试
      const articleJson: ArticleJson = { ...json, no: article.index }
      const { violations, wordCount, imageCount } = validateArticle(articleJson)

      if (violations.length === 0) {
        await prisma.article.update({
          where: { id: article.id },
          data: {
            data: articleJson,
            status: ArticleStatus.DATA_DONE,
            attempts: 0,
            lastError: null,
            sessionUrl: page.url(),
          },
        })
        console.log(
          `[article] 成稿完成: book.id=${book.id}, 第${article.index}篇, 字数=${wordCount}, 插图=${imageCount}, 失败尝试=${state.attempts}`,
        )
        return
      }

      await this.handleFailure(
        $page,
        article.id,
        state,
        violations.map((violation) => violation.message),
        {
          needExpand: wordCount < WORD_THRESHOLD,
          wordCount,
        },
      )
    }
  }

  /**
   * 记录一次失败并发送修复指令。不设重试上限，直到拿到通过校验的成稿。
   * attempts 已在 recordFailure 中落库，调用方无需再写。
   */
  private async handleFailure(
    $page: YuanBaoPage,
    articleId: string,
    state: GenerateState,
    violations: string[],
    extra: { needExpand: boolean; wordCount: number; jsonQuoteHint?: boolean },
  ): Promise<void> {
    const reason = violations.join('；')
    state.attempts = await this.recordFailure(articleId, state.attempts, reason)

    const repair = await renderTemplate('article-repair.prompt', {
      violations,
      needExpand: extra.needExpand,
      wordCount: extra.wordCount,
      threshold: WORD_THRESHOLD,
      gap: Math.max(0, WORD_THRESHOLD - extra.wordCount),
      jsonQuoteHint: extra.jsonQuoteHint ?? false,
    })

    await $page.clearEditor()
    await $page.input(repair)
    await $page.send()
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
