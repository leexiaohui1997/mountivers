import { prisma } from './db.js'

/** 找不到引擎时锁定 5 小时 */
export const BOOK_NO_ENGINE_LOCK_MS = 5 * 60 * 60 * 1000

/** 标记书籍暂时不处理，并累加连续找不到引擎次数 */
export async function lockBookForNoEngine(bookId: string): Promise<void> {
  await prisma.book.update({
    where: { id: bookId },
    data: {
      noEngineLockedAt: new Date(),
      noEngineLockCount: { increment: 1 },
    },
  })
}

/** 成功拿到引擎后清除锁定状态和连续次数 */
export async function clearBookNoEngineLock(bookId: string): Promise<void> {
  await prisma.book.update({
    where: { id: bookId },
    data: {
      noEngineLockedAt: null,
      noEngineLockCount: 0,
    },
  })
}
