import { lstat, rm, unlink } from 'node:fs/promises'
import path from 'node:path'

import { prisma } from './db.js'
import { IMAGE_DOWNLOAD_DIR } from './env.js'

/**
 * 删除一本书及其全部产物：
 * 1. IMAGE_DOWNLOAD_DIR/{bookId}
 * 2. 书籍文件
 * 3. Book 数据（Article / MicroHeadline 依赖数据库级联删除）
 */
export async function deleteBook(bookId: string): Promise<boolean> {
  const book = await prisma.book.findUnique({
    where: { id: bookId },
    select: { id: true, path: true },
  })
  if (!book) return false

  const imageRoot = path.resolve(IMAGE_DOWNLOAD_DIR)
  const imageDir = path.resolve(imageRoot, bookId)

  if (imageDir === imageRoot || !imageDir.startsWith(`${imageRoot}${path.sep}`)) {
    throw new Error(`非法的书籍图片目录: ${imageDir}`)
  }

  await rm(imageDir, { recursive: true, force: true })

  try {
    const stat = await lstat(book.path)
    if (stat.isDirectory()) {
      throw new Error(`书籍路径是目录，拒绝删除: ${book.path}`)
    }
    await unlink(book.path)
  } catch (error) {
    if (!isNotFound(error)) throw error
  }

  await prisma.book.delete({ where: { id: bookId } })
  return true
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  )
}
