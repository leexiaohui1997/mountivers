import { existsSync } from 'node:fs'

import { ArticleStatus } from '@toutiao-flow/db'

import ToutiaoPage from '../browser-pages/toutiao.js'
import { isOverviewJson, MIN_COLLECTION_NAME_LENGTH } from '../types/overview.js'
import { browserQueue } from '../utils/browser-queue.js'
import { getPage, releasePage } from '../utils/browser.js'
import { prisma } from '../utils/db.js'
import BaseRole from '../utils/role/base.js'

/** 头条合集创建失败上限；达到后跳过，等待人工重置 */
const MAX_ATTEMPTS = 3

/** 头条合集创建成功后的角色冻结时长 */
const SUCCESS_FREEZE_MS = 2 * 60 * 1000

const COLLECTION_PAGE_ID = 'toutiao-collection'

/** 已提示过“合集封面未就绪”的书籍，避免每秒重复刷日志 */
const warnedMissingCover = new Set<string>()

/**
 * 为已产出成稿的书籍创建头条合集。
 * 扫描条件：未创建 + 头条封面已生成 + 至少一篇成稿 IMAGE_DONE。
 */
export default class BookCollectionRole extends BaseRole {
  cron = '* * * * * ?'
  waitPrevious = true

  async run(): Promise<void> {
    const book = await prisma.book.findFirst({
      where: {
        toutiaoCollectionCreated: false,
        toutiaoCollectionAttempts: { lt: MAX_ATTEMPTS },
        toutiaoCoverPath: { not: null },
        articles: { some: { status: ArticleStatus.IMAGE_DONE } },
      },
      orderBy: { createdAt: 'asc' },
    })
    if (!book) return

    const coverPath = book.toutiaoCoverPath
    if (!coverPath || !existsSync(coverPath)) {
      if (!warnedMissingCover.has(book.id)) {
        warnedMissingCover.add(book.id)
        console.log(
          `[book-collection] 跳过：头条合集封面尚未生成或文件缺失 (book.id=${book.id}, path=${coverPath ?? 'null'})`,
        )
      }
      return
    }

    const overview = book.overview
    if (!isOverviewJson(overview)) {
      await this.recordFailure(
        book.id,
        book.toutiaoCollectionAttempts,
        '概览 JSON 非法，无法创建合集',
      )
      return
    }

    const name = overview.collectionName.trim()
    if (Array.from(name).length < MIN_COLLECTION_NAME_LENGTH) {
      await this.recordFailure(
        book.id,
        book.toutiaoCollectionAttempts,
        `合集名称不足 ${MIN_COLLECTION_NAME_LENGTH} 字：${name}`,
      )
      return
    }

    console.log(`[book-collection] 开始: book.id=${book.id}, 合集=《${name}》`)

    try {
      await browserQueue.run(`book-collection:${book.id}`, async () => {
        const page = await getPage(COLLECTION_PAGE_ID)
        try {
          const $page = new ToutiaoPage(page)
          await $page.ensureLogin()
          await $page.ensureCollection(name, coverPath)
        } finally {
          await releasePage(page)
        }
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(`[book-collection] 创建失败: book.id=${book.id}: ${reason}`)
      await this.recordFailure(book.id, book.toutiaoCollectionAttempts, reason)
      return
    }

    await prisma.book.update({
      where: { id: book.id },
      data: {
        toutiaoCollectionCreated: true,
        toutiaoCollectionAttempts: 0,
        toutiaoCollectionLastError: null,
      },
    })
    console.log(`[book-collection] 完成: book.id=${book.id}, 合集=《${name}》 → created=true`)

    // 创建完成后冻结本角色 2 分钟，避免连续高频操作头条后台
    this.freezeUntil = new Date(Date.now() + SUCCESS_FREEZE_MS)
    console.log(`[book-collection] 角色冻结至 ${this.freezeUntil.toISOString()}`)
  }

  /** 失败次数 +1；达到上限后后续查询会跳过该书 */
  private async recordFailure(bookId: string, attempts: number, reason: string): Promise<void> {
    const next = attempts + 1
    const reachedLimit = next >= MAX_ATTEMPTS

    await prisma.book.update({
      where: { id: bookId },
      data: {
        toutiaoCollectionAttempts: next,
        toutiaoCollectionLastError: reason.slice(0, 2000),
      },
    })

    console.error(
      `[book-collection] 第 ${next}/${MAX_ATTEMPTS} 次失败: ${reason}${reachedLimit ? '（达到上限，后续跳过，需人工重置）' : ''}`,
    )
  }
}
