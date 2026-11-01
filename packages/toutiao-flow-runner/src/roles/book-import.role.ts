import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

import { BookStatus } from '@toutiao-flow/db'

import { scanBookFiles } from '../utils/book-scan.js'
import { cleanDirectory, isSameOrInside } from '../utils/clean-directory.js'
import { prisma } from '../utils/db.js'
import BaseRole from '../utils/role/base.js'

const FREEZE_MS = 60 * 60 * 1000
const INSERT_INTERVAL_MS = 1000

interface UploadedBook {
  source: string
  dest: string
}

/**
 * 书籍导入角色：
 * - Book 表非空：冻结 1 小时；
 * - Book 表为空：扫描 BOOK_SOURCE_DIR，复制到 BOOK_UPLOAD_DIR，
 *   事务创建全部 Book，成功后冻结 1 小时。
 *
 * 源文件不删除、不移动，作为下一轮循环的固定素材库。
 */
export default class BookImportRole extends BaseRole {
  cron = '* * * * * ?'
  waitPrevious = true

  async run(): Promise<void> {
    try {
      const count = await prisma.book.count()
      if (count > 0) {
        return
      }

      const sourceDir = process.env.BOOK_SOURCE_DIR
      const uploadDir = process.env.BOOK_UPLOAD_DIR
      const imageDir = process.env.IMAGE_DOWNLOAD_DIR
      if (!sourceDir || !uploadDir) {
        console.error('[book-import] 缺少 BOOK_SOURCE_DIR 或 BOOK_UPLOAD_DIR')
        return
      }

      const cleanupDirs = [uploadDir, imageDir].filter((dir): dir is string => Boolean(dir))
      const overlapsSource = cleanupDirs.some(
        (dir) => isSameOrInside(dir, sourceDir) || isSameOrInside(sourceDir, dir),
      )
      const cleanupDirsOverlap =
        cleanupDirs.length > 1 &&
        (isSameOrInside(cleanupDirs[0], cleanupDirs[1]) ||
          isSameOrInside(cleanupDirs[1], cleanupDirs[0]))

      if (overlapsSource || cleanupDirsOverlap) {
        console.error('[book-import] 清理目录与源目录或彼此重叠，跳过清理以避免误删')
      } else {
        for (const dir of cleanupDirs) {
          try {
            await cleanDirectory(dir)
            console.log(`[book-import] 已清理目录: ${dir}`)
          } catch (error) {
            console.error(
              `[book-import] 清理目录失败，继续导入: ${dir}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            )
          }
        }
      }

      const files = await scanBookFiles(sourceDir)
      if (!files.length) {
        console.log(`[book-import] 未找到可导入书籍: ${sourceDir}`)
        return
      }

      await mkdir(uploadDir, { recursive: true })
      const uploaded: UploadedBook[] = []
      const createdBookIds: string[] = []
      const createdDests = new Set<string>()

      try {
        for (const file of files) {
          const ext = path.extname(file.path)
          const dest = path.join(uploadDir, `${randomUUID()}${ext}`)
          await copyFile(file.path, dest)
          uploaded.push({ source: file.path, dest })
          console.log(`[book-import] 已上传: ${file.path} -> ${dest}`)
        }

        for (const [index, item] of uploaded.entries()) {
          if (index > 0) {
            await sleep(INSERT_INTERVAL_MS)
          }

          const book = await prisma.book.create({
            data: {
              path: item.dest,
              status: BookStatus.READY,
            },
          })
          createdBookIds.push(book.id)
          createdDests.add(item.dest)
          console.log(`[book-import] 已录入 ${index + 1}/${uploaded.length} 本书`)
        }

        console.log(`[book-import] 已创建 ${uploaded.length} 本书`)
      } catch (error) {
        console.error(
          `[book-import] 导入失败，清理本轮上传副本: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )

        let rollbackFailed = false

        if (createdBookIds.length) {
          try {
            await prisma.book.deleteMany({ where: { id: { in: createdBookIds } } })
          } catch (cleanupError) {
            rollbackFailed = true
            console.error(
              `[book-import] 回滚 Book 记录失败: ${
                cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
              }`,
            )
          }
        }

        for (const item of uploaded) {
          // 数据库回滚失败时保留已创建 Book 引用的文件，避免留下坏记录
          if (rollbackFailed && createdDests.has(item.dest)) continue
          await rm(item.dest, { force: true }).catch(() => undefined)
        }
        throw error
      }
    } catch (error) {
      console.error(
        `[book-import] 执行失败: ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      this.freeze()
    }
  }

  private freeze(): void {
    this.freezeUntil = new Date(Date.now() + FREEZE_MS)
    console.log(`[book-import] 冻结至 ${this.freezeUntil.toISOString()}`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
