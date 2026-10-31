import { BookStatus } from '@toutiao-flow/db'

import { prisma } from '../utils/db.js'
import { deleteBook } from '../utils/delete-book.js'
import BaseRole from '../utils/role/base.js'
import { getStartOfLocalDay } from '../utils/time.js'
import { getWtxReportGeneratedAt } from '../utils/wtx-report.js'

/**
 * 今日报表生成后，清理已完成的书籍及其图片、书籍文件。
 * Article / MicroHeadline 由数据库外键级联删除。
 */
export default class DeleteDoneBooksRole extends BaseRole {
  cron = '0 0 * * * ?'
  waitPrevious = true

  async run(): Promise<void> {
    const lastReportAt = await getWtxReportGeneratedAt()
    if (!lastReportAt || lastReportAt < getStartOfLocalDay()) {
      return
    }

    const books = await prisma.book.findMany({
      where: { status: BookStatus.DONE },
      select: { id: true, path: true },
      orderBy: { createdAt: 'asc' },
    })

    for (const book of books) {
      try {
        const deleted = await deleteBook(book.id)
        if (deleted) {
          console.log(`[delete-done-books] 已删除书籍: ${book.id} (${book.path})`)
        }
      } catch (error) {
        console.error(
          `[delete-done-books] 删除失败: ${book.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    }
  }
}
