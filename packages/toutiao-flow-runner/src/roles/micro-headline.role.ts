import { existsSync } from 'node:fs'

import { BookStatus, Prisma } from '@toutiao-flow/db'

import { AiPageAdapter } from '../ai/adapter.js'
import { getEngine } from '../ai/helper.js'
import { generateMicroHeadline } from '../ai/logics/generate-micro-headline.js'
import { isMicroHeadlineData } from '../types/micro-headline.js'
import { isOverviewJson, type OverviewJson } from '../types/overview.js'
import { browserQueue } from '../utils/browser-queue.js'
import { prisma } from '../utils/db.js'
import BaseRole from '../utils/role/base.js'
import { ROLE_PRIORITY } from '../utils/role-priority.js'
import { getStartOfLocalDay } from '../utils/time.js'

const DAILY_TARGET = 3

interface SourceBook {
  id: string
  path: string
  sessionUrl: string | null
  overview: OverviewJson
}

export default class MicroHeadlineRole extends BaseRole {
  // 凌晨 0-4 点整点触发，每天补足 DAILY_TARGET 条
  cron = '0 0 0-4 * * *'
  waitPrevious = true
  priority = ROLE_PRIORITY.MICRO_HEADLINE

  async run(): Promise<void> {
    const startOfToday = getStartOfLocalDay()
    let count = await this.countToday(startOfToday)

    if (count >= DAILY_TARGET) return

    console.log(`[micro-headline] 今日已有 ${count} 条，开始补足到 ${DAILY_TARGET} 条`)

    while (count < DAILY_TARGET) {
      const book = await this.pickRandomBook()
      if (!book) {
        console.log('[micro-headline] 没有可用的书籍，停止本轮')
        break
      }

      try {
        await browserQueue.run(
          `micro-headline:${book.id}:${count + 1}`,
          async () => {
            const engine = await getEngine({
              ext: book.path,
              sessionUrl: book.sessionUrl ?? undefined,
            })
            if (!engine) {
              throw new Error(`不支持的书籍格式: ${book.path}`)
            }

            const ai = new AiPageAdapter(engine)
            try {
              const excludeTopics = await this.getExistingTopics(book.id)
              // 每条微头条单独开新会话，避免同书多条互相干扰、上下文持续膨胀
              const { data } = await generateMicroHeadline(ai, {
                bookPath: book.path,
                overview: book.overview,
                excludeTopics,
              })

              await prisma.microHeadline.create({
                data: {
                  bookId: book.id,
                  data,
                  imagesDone: false,
                },
              })

              console.log(
                `[micro-headline] 已创建: 《${book.overview.bookTitle}》 topic=${data.topic}`,
              )
            } finally {
              await ai.release()
            }
          },
          this.priority,
        )

        count = await this.countToday(startOfToday)
      } catch (error) {
        console.error(
          `[micro-headline] 创作失败: ${error instanceof Error ? error.message : String(error)}`,
        )
        break
      }
    }
  }

  private async countToday(startOfToday: Date): Promise<number> {
    return prisma.microHeadline.count({
      where: { createdAt: { gte: startOfToday } },
    })
  }

  /** 随机选书；允许重复选择同一本书 */
  private async pickRandomBook(): Promise<SourceBook | null> {
    const books = await prisma.book.findMany({
      where: {
        status: { in: [BookStatus.PROCESSING, BookStatus.DONE] },
        overview: { not: Prisma.DbNull },
      },
      select: {
        id: true,
        path: true,
        sessionUrl: true,
        overview: true,
      },
    })

    const eligible = books.filter(
      (book): book is typeof book & { overview: OverviewJson } =>
        existsSync(book.path) && isOverviewJson(book.overview),
    )
    if (!eligible.length) return null

    return eligible[Math.floor(Math.random() * eligible.length)]
  }

  /** 同一本书的历史话题全部排除，避免重复 */
  private async getExistingTopics(bookId: string): Promise<string[]> {
    const rows = await prisma.microHeadline.findMany({
      where: { bookId },
      select: { data: true },
    })

    return rows.flatMap((row) => (isMicroHeadlineData(row.data) ? [row.data.topic] : []))
  }
}
