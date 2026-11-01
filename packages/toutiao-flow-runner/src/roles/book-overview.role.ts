import path from 'node:path'

import { BookStatus } from '@toutiao-flow/db'

import { AiPageAdapter } from '../ai/adapter.js'
import { CreditLimitError } from '../ai/error.js'
import { createJudgeAi, pickEngine } from '../ai/helper.js'
import { AttachmentMissingError } from '../ai/logics/attachment-missing.js'
import { generateOverview } from '../ai/logics/generate-overview.js'
import { clearBookNoEngineLock, lockBookForNoEngine } from '../utils/book-no-engine.js'
import { browserQueue } from '../utils/browser-queue.js'
import { prisma } from '../utils/db.js'
import { getPublishDateKey } from '../utils/publish-stat.js'
import BaseRole from '../utils/role/base.js'
import { ROLE_PRIORITY } from '../utils/role-priority.js'

export default class BookOverview extends BaseRole {
  cron = '* * * * * ?'
  waitPrevious = true
  priority = ROLE_PRIORITY.BOOK_OVERVIEW

  async run(): Promise<void> {
    const book = await prisma.book.findFirst({
      where: {
        status: BookStatus.READY,
        noEngineLockedAt: null,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    if (!book) return

    const ext = path.extname(book.path)
    console.log(`[book-overview] 开始生成概览: ${book.path} (book.id=${book.id}, ext=${ext})`)

    try {
      await browserQueue.run(
        `book-overview:${book.id}`,
        async () => {
          const engine = await pickEngine({
            capability: 'work',
            attachments: [book.path],
            sessionUrl: book.sessionUrl ?? undefined,
          })
          if (!engine) {
            await lockBookForNoEngine(book.id)
            console.log(`[book-overview] 找不到可用引擎，锁定 5 小时: ${book.path}`)
            return
          }

          await clearBookNoEngineLock(book.id)
          const ai = new AiPageAdapter(engine)
          const judgeAi = await createJudgeAi()
          try {
            const { data, sessionUrl } = await generateOverview(ai, {
              bookPath: book.path,
              sessionUrl: book.sessionUrl ?? undefined,
              judgeAi,
            })

            const statDate = getPublishDateKey()

            await prisma.$transaction(async (tx) => {
              await tx.book.update({
                where: { id: book.id },
                data: {
                  overview: data,
                  sessionUrl,
                  status: BookStatus.PROCESSING,
                },
              })

              // 已存在则保留（可能已生成成稿/图片），避免重复占位
              for (const item of data.articlePlan) {
                await tx.article.upsert({
                  where: { bookId_index: { bookId: book.id, index: item.no } },
                  update: {},
                  create: { index: item.no, bookId: book.id },
                })
              }

              await tx.publishStat.upsert({
                where: { date: statDate },
                update: { overviewCount: { increment: 1 } },
                create: { date: statDate, overviewCount: 1 },
              })
            })

            console.log(
              `[book-overview] 概览已生成: 《${data.bookTitle}》 (book.id=${book.id}) → ${BookStatus.PROCESSING}`,
            )
          } finally {
            await ai.release()
            await judgeAi?.release()
          }
        },
        this.priority,
      )
    } catch (error) {
      if (error instanceof AttachmentMissingError) {
        console.warn(
          `[book-overview] 附件缺失，跳过本次: book.id=${book.id}, missing=${error.missing.join('、') || '未知'}`,
        )
        return
      }

      if (error instanceof CreditLimitError) {
        console.warn(
          `[book-overview] 额度/会员限制，暂停本次任务: book.id=${book.id}, ${error.message}`,
        )
        return
      }

      throw error
    }
  }
}
