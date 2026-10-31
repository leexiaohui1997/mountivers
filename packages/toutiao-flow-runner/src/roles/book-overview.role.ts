import path from 'node:path'

import { BookStatus } from '@toutiao-flow/db'

import { AiPageAdapter } from '../ai/adapter.js'
import { getEngine } from '../ai/helper.js'
import { generateOverview } from '../ai/logics/generate-overview.js'
import { browserQueue } from '../utils/browser-queue.js'
import { prisma } from '../utils/db.js'
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
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    if (!book) return

    const ext = path.extname(book.path)
    console.log(`[book-overview] 开始生成概览: ${book.path} (book.id=${book.id}, ext=${ext})`)

    await browserQueue.run(
      `book-overview:${book.id}`,
      async () => {
        const engine = await getEngine({ ext, sessionUrl: book.sessionUrl ?? undefined })
        if (!engine) {
          console.log(`[book-overview] 不支持的文件类型，跳过: ${book.path}`)
          return
        }

        const ai = new AiPageAdapter(engine)
        try {
          const { data, sessionUrl } = await generateOverview(ai, {
            bookPath: book.path,
            sessionUrl: book.sessionUrl ?? undefined,
          })

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
          })

          console.log(
            `[book-overview] 概览已生成: 《${data.bookTitle}》 (book.id=${book.id}) → ${BookStatus.PROCESSING}`,
          )
        } finally {
          await ai.release()
        }
      },
      this.priority,
    )
  }
}
