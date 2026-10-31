import { existsSync } from 'node:fs'

import { ArticleStatus } from '@toutiao-flow/db'

import ToutiaoPublishPage, {
  CollectionUnavailableError,
  PublishLimitError,
  type PublishBlock,
} from '../browser-pages/toutiao-publish.js'
import ToutiaoPage from '../browser-pages/toutiao.js'
import { isArticleJson, type ArticleJson } from '../types/article.js'
import { isOverviewJson } from '../types/overview.js'
import { browserQueue } from '../utils/browser-queue.js'
import { getPage, releasePage } from '../utils/browser.js'
import { prisma } from '../utils/db.js'
import {
  getNextLocalMidnight,
  getPublishLimitUntil,
  setPublishLimitUntil,
} from '../utils/publish-limit.js'
import BaseRole from '../utils/role/base.js'
import { mergePublishTags } from '../utils/tags.js'
import { countWords, WORD_THRESHOLD } from '../utils/word-count.js'

/** 头条发布失败上限；达到后置 PUBLISH_FAILED */
const MAX_PUBLISH_ATTEMPTS = 3

/** 合集不可用时的冻结时长 */
const COLLECTION_FREEZE_MS = 10 * 60 * 1000

/** 发布成功后的角色冻结时长 */
const SUCCESS_FREEZE_MS = 5 * 60 * 1000

const PUBLISH_PAGE_ID = 'toutiao-publish'

/** 上次打印的限额截止时间，避免每秒刷日志 */
let lastLimitLogKey: string | null = null

export default class ArticlePublishRole extends BaseRole {
  cron = '* * * * * ?'
  waitPrevious = true
  priority = 1

  async run(): Promise<void> {
    const limitUntil = await getPublishLimitUntil()
    if (limitUntil) {
      const key = limitUntil.toISOString()
      if (lastLimitLogKey !== key) {
        lastLimitLogKey = key
        console.log(`[article-publish] 今日发布已达上限，暂停至 ${key}`)
      }
      return
    }
    lastLimitLogKey = null

    const article = await prisma.article.findFirst({
      where: {
        status: ArticleStatus.IMAGE_DONE,
        publishAttempts: { lt: MAX_PUBLISH_ATTEMPTS },
        book: { toutiaoCollectionCreated: true },
      },
      orderBy: [{ book: { createdAt: 'asc' } }, { index: 'asc' }],
      include: { book: true },
    })
    if (!article) return

    const { book } = article
    const data = article.data
    if (!isArticleJson(data)) {
      await this.recordFailure(article.id, article.publishAttempts, '成稿 data 非法，无法发布')
      return
    }

    const title = data.title.trim()
    if (!title) {
      await this.recordFailure(article.id, article.publishAttempts, '成稿缺少主标题')
      return
    }

    const wordCount = countWords(data)
    if (wordCount < WORD_THRESHOLD) {
      await this.recordFailure(
        article.id,
        article.publishAttempts,
        `正文字数不足：${wordCount} < ${WORD_THRESHOLD}`,
      )
      return
    }

    if (!data.cover || !existsSync(data.cover)) {
      await this.recordFailure(article.id, article.publishAttempts, `成稿封面不存在: ${data.cover}`)
      return
    }

    const content = this.toPublishBlocks(data)
    if (!content) {
      await this.recordFailure(article.id, article.publishAttempts, '成稿存在缺失的插图文件')
      return
    }

    const overview = book.overview
    if (!isOverviewJson(overview)) {
      await this.recordFailure(article.id, article.publishAttempts, '概览 JSON 非法，无法确定合集')
      return
    }
    const collectionName = overview.collectionName.trim()
    if (!collectionName) {
      await this.recordFailure(article.id, article.publishAttempts, '概览缺少合集名称')
      return
    }

    const tags = mergePublishTags(data.tags, book.tags)

    console.log(
      `[article-publish] 开始: book.id=${book.id}, 第${article.index}篇, 合集=《${collectionName}》, 标签=${tags.join('、')}`,
    )

    let alreadyPublished = false
    try {
      await browserQueue.run(`publish:${book.id}:${article.index}`, async () => {
        const page = await getPage(PUBLISH_PAGE_ID)
        try {
          const $toutiao = new ToutiaoPage(page)
          await $toutiao.ensureLogin()

          const $publish = new ToutiaoPublishPage(page)
          if (await $publish.hasPublishedArticle(title)) {
            alreadyPublished = true
            console.log(`[article-publish] 作品管理页已存在《${title}》，跳过重复发布`)
            return
          }

          await $publish.publishArticle({
            title,
            coverPath: data.cover!,
            collectionName,
            content,
            tags,
          })
        } finally {
          await releasePage(page)
        }
      })
    } catch (error) {
      if (error instanceof PublishLimitError) {
        const until = getNextLocalMidnight()
        await setPublishLimitUntil(until)
        console.log(
          `[article-publish] 检测到今日发布上限，已写入状态 ${until.toISOString()}（${error.message}）`,
        )
        return
      }

      if (error instanceof CollectionUnavailableError) {
        this.freezeUntil = new Date(Date.now() + COLLECTION_FREEZE_MS)
        console.log(`[article-publish] ${error.message}，角色冻结 10 分钟后重试`)
        return
      }

      const reason = error instanceof Error ? error.message : String(error)
      console.error(
        `[article-publish] 发布失败: book.id=${book.id}, 第${article.index}篇: ${reason}`,
      )
      await this.recordFailure(article.id, article.publishAttempts, reason)
      return
    }

    await this.markPublished(article.id)
    console.log(
      `[article-publish] 完成: book.id=${book.id}, 第${article.index}篇《${title}》 → ${ArticleStatus.PUBLISHED}${alreadyPublished ? '（此前已发布）' : ''}`,
    )

    // 发布成功后冻结本角色 5 分钟，降低连续发布频率
    this.freezeUntil = new Date(Date.now() + SUCCESS_FREEZE_MS)
    console.log(`[article-publish] 角色冻结至 ${this.freezeUntil.toISOString()}`)
  }

  /** 把成稿块转为发布块；插图路径缺失时返回 null */
  private toPublishBlocks(data: ArticleJson): PublishBlock[] | null {
    const blocks: PublishBlock[] = []

    for (const block of data.content) {
      if (block.type === 'image') {
        if (!block.content || !existsSync(block.content)) return null
        blocks.push({ type: 'image', content: block.content })
      } else {
        blocks.push({ type: block.type, content: block.content })
      }
    }

    return blocks
  }

  private async markPublished(articleId: string): Promise<void> {
    await prisma.article.update({
      where: { id: articleId },
      data: {
        status: ArticleStatus.PUBLISHED,
        publishedAt: new Date(),
        publishAttempts: 0,
        publishLastError: null,
      },
    })
  }

  /** 发布失败 +1；达到上限时置 PUBLISH_FAILED */
  private async recordFailure(articleId: string, attempts: number, reason: string): Promise<void> {
    const next = attempts + 1
    const reachedLimit = next >= MAX_PUBLISH_ATTEMPTS

    await prisma.article.update({
      where: { id: articleId },
      data: {
        publishAttempts: next,
        publishLastError: reason.slice(0, 2000),
        ...(reachedLimit ? { status: ArticleStatus.PUBLISH_FAILED } : {}),
      },
    })

    console.error(
      `[article-publish] 第 ${next}/${MAX_PUBLISH_ATTEMPTS} 次失败: ${reason}${reachedLimit ? ' → PUBLISH_FAILED' : ''}`,
    )
  }
}
