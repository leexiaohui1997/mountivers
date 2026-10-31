import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { BookStatus } from '@toutiao-flow/db'

import { isOverviewJson } from '../types/overview.js'
import { browserQueue } from '../utils/browser-queue.js'
import { prisma } from '../utils/db.js'
import { IMAGE_DOWNLOAD_DIR } from '../utils/env.js'
import { runImageTasks, type ImageTask } from '../utils/image-runner.js'
import BaseRole from '../utils/role/base.js'

export default class GenerateImageRole extends BaseRole {
  cron = '* * * * * ?'
  waitPrevious = true

  async run(): Promise<void> {
    const tasks = await this.getBookSchedule()
    if (!tasks.length) return

    // 浏览器是共享单例：整段页面流程作为一个任务串行执行
    await browserQueue.run(`generate-image:${tasks.length}`, async () => {
      await runImageTasks(tasks)
    })
  }

  async getBookSchedule(): Promise<ImageTask[]> {
    const books = await prisma.book.findMany({
      where: {
        status: BookStatus.PROCESSING,
        OR: [{ toutiaoCoverPath: { equals: null } }, { xhsCoverPath: { equals: null } }],
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    const tasks: ImageTask[] = []
    for (const book of books) {
      const overview = book.overview
      if (!isOverviewJson(overview)) continue

      let toutiaoCoverPath = book.toutiaoCoverPath

      if (!book.toutiaoCoverPath) {
        tasks.push({
          label: `toutiao-cover:${book.id}`,
          prompt: () => overview.collectionCoverPrompt,
          outputPath: () => path.resolve(IMAGE_DOWNLOAD_DIR, `${book.id}/${randomUUID()}.png`),
          sessionUrl: () => book.sessionUrl,
          onPromptFixed: async (fixedPrompt) => {
            overview.collectionCoverPrompt = fixedPrompt
            await prisma.book.update({
              where: { id: book.id },
              data: { overview },
            })
            console.log(
              `[gen-image] 新提示词已覆盖 overview.collectionCoverPrompt (book.id=${book.id})`,
            )
          },
          onResult: async (filePath, tx) => {
            toutiaoCoverPath = filePath
            await tx.book.update({
              where: { id: book.id },
              data: { toutiaoCoverPath },
            })
            console.log(`[gen-image] 头条封面落库: book.id=${book.id} → ${toutiaoCoverPath}`)
          },
        })
      }

      if (!book.xhsCoverPath) {
        tasks.push({
          label: `xhs-cover:${book.id}`,
          prompt: () => overview.xhsCollectionCoverPrompt,
          outputPath: () => path.resolve(IMAGE_DOWNLOAD_DIR, `${book.id}/${randomUUID()}.png`),
          attachPath: () => toutiaoCoverPath,
          sessionUrl: () => book.sessionUrl,
          onPromptFixed: async (fixedPrompt) => {
            overview.xhsCollectionCoverPrompt = fixedPrompt
            await prisma.book.update({
              where: { id: book.id },
              data: { overview },
            })
            console.log(
              `[gen-image] 新提示词已覆盖 overview.xhsCollectionCoverPrompt (book.id=${book.id})`,
            )
          },
          onResult: async (xhsCoverPath, tx) => {
            await tx.book.update({
              where: { id: book.id },
              data: { xhsCoverPath },
            })
            console.log(`[gen-image] 小红书封面落库: book.id=${book.id} → ${xhsCoverPath}`)
          },
        })
      }
    }

    return tasks
  }
}
