import { ArticleStatus, BookStatus } from '@toutiao-flow/db'

import { prisma } from '../utils/db.js'
import BaseRole from '../utils/role/base.js'

/**
 * 收尾角色：一本书的所有成稿都已发布后，把 Book 标记为 DONE。
 * 纯数据库状态推进，不操作浏览器。
 */
export default class BookDoneRole extends BaseRole {
  cron = '* * * * * ?'
  waitPrevious = true

  async run(): Promise<void> {
    const books = await prisma.book.findMany({
      where: { status: BookStatus.PROCESSING },
      select: {
        id: true,
        articles: { select: { status: true } },
      },
    })

    for (const book of books) {
      if (book.articles.length === 0) continue
      if (!book.articles.every((article) => article.status === ArticleStatus.PUBLISHED)) {
        continue
      }

      await prisma.book.update({
        where: { id: book.id },
        data: { status: BookStatus.DONE },
      })
      console.log(
        `[book-done] 全部成稿已发布: book.id=${book.id}, 篇数=${book.articles.length} → ${BookStatus.DONE}`,
      )
    }
  }
}
