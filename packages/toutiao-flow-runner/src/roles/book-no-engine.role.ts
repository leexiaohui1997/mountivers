import { BookStatus } from '@toutiao-flow/db'

import { BOOK_NO_ENGINE_LOCK_MS } from '../utils/book-no-engine.js'
import { prisma } from '../utils/db.js'
import BaseRole from '../utils/role/base.js'

/**
 * 找不到引擎的书籍恢复角色：
 * - 连续锁定次数 > 4：标记 DONE（保留锁字段），交给清理角色；
 * - 锁定满 5 小时：解除锁定，保留次数。
 */
export default class BookNoEngineRole extends BaseRole {
  cron = '0 */10 * * * *'
  waitPrevious = true

  async run(): Promise<void> {
    const books = await prisma.book.findMany({
      where: { noEngineLockedAt: { not: null } },
    })

    const cutoff = Date.now() - BOOK_NO_ENGINE_LOCK_MS

    for (const book of books) {
      if (book.noEngineLockCount > 4) {
        if (book.status !== BookStatus.DONE) {
          await prisma.book.update({
            where: { id: book.id },
            data: { status: BookStatus.DONE },
          })
          console.warn(
            `[book-no-engine] 连续 ${book.noEngineLockCount} 次找不到引擎，标记 DONE: book.id=${book.id}`,
          )
        }
        continue
      }

      if (book.noEngineLockedAt && book.noEngineLockedAt.getTime() <= cutoff) {
        await prisma.book.update({
          where: { id: book.id },
          data: { noEngineLockedAt: null },
        })
        console.log(`[book-no-engine] 解除锁定: book.id=${book.id}`)
      }
    }
  }
}
