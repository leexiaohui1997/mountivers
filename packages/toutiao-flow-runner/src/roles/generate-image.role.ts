import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { BookStatus, PrismaClient } from '@toutiao-flow/db'

import WenxinPage from '../browser-pages/wenxin.js'
import YuanBaoPage from '../browser-pages/yuanbao.js'
import { isOverviewJson } from '../types/overview.js'
import { attachToFile, saveFile } from '../utils/attach.js'
import { getPage, releasePage } from '../utils/browser.js'
import { prisma } from '../utils/db.js'
import { IMAGE_DOWNLOAD_DIR } from '../utils/env.js'
import BaseRole from '../utils/role/base.js'

type Task = {
  prompt: () => string
  attachPath?: () => string | null
  onResult?: (filePath: string, tx: PrismaClient) => Promise<void>
  onFail?: () => Promise<void>
}

export default class GenerateImageRole extends BaseRole {
  cron = '* * * * * ?'
  waitPrevious = true

  async run(): Promise<void> {
    const tasks: Task[] = [...(await this.getBookSchedule()), ...(await this.getArticleSchedule())]
    if (!tasks.length) return
    await this.generateImageYuanbao(tasks)
  }

  async getBookSchedule(): Promise<Task[]> {
    const books = await prisma.book.findMany({
      where: {
        status: BookStatus.PROCESSING,
        OR: [{ toutiaoCoverPath: { equals: null } }, { xhsCoverPath: { equals: null } }],
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    const tasks: Task[] = []
    for (const book of books) {
      const overview = book.overview
      if (!isOverviewJson(overview)) continue

      let toutiaoCoverPath = book.toutiaoCoverPath

      if (!book.toutiaoCoverPath) {
        tasks.push({
          prompt: () => overview.collectionCoverPrompt,
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
          prompt: () => overview.xhsCollectionCoverPrompt,
          attachPath: () => toutiaoCoverPath,
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

  async getArticleSchedule(): Promise<Task[]> {
    return []
  }

  async generateImageYuanbao(tasks: Task[]) {
    if (!tasks.length) return
    const yuanbaoPage = await getPage('gen-img-yuanbao')
    const wenxinPage = await getPage('gen-img-yuanbao-wenxin')

    try {
      const $wenxinPage = new WenxinPage(wenxinPage)
      await $wenxinPage.newSession()
      const $yuanbaoPage = new YuanBaoPage(yuanbaoPage)
      await $yuanbaoPage.newSession()

      await yuanbaoPage.bringToFront()
      await $yuanbaoPage.setImageMode()

      for (const task of tasks) {
        let src = ''
        // 元宝出图
        while (true) {
          await yuanbaoPage.bringToFront()
          await $yuanbaoPage.clearEditor()
          const attachPath = task.attachPath?.()
          if (attachPath) {
            const file = await attachToFile({ type: 'file', path: attachPath })
            await $yuanbaoPage.uploadImage(file)
          }
          await $yuanbaoPage.input(task.prompt())
          await $yuanbaoPage.send()

          try {
            src = await $yuanbaoPage.getImageAnswer()
          } catch {
            if (task.onFail) {
              await task.onFail()
              continue
            }
          }
          break
        }

        if (!src) {
          continue
        }

        // 文心去水印
        let wenxinResult = ''
        const yuanbaoImage = await attachToFile({ type: 'url', path: src, filename: 'image.png' })
        await wenxinPage.bringToFront()
        let reTryTimes = 0
        while (reTryTimes < 3) {
          await $wenxinPage.pasteImage(yuanbaoImage)
          await $wenxinPage.input('去水印')
          await $wenxinPage.send()
          try {
            wenxinResult = await $wenxinPage.getImageAnswer()
          } catch {
            reTryTimes++
            continue
          }
          break
        }

        const outputPath = path.resolve(IMAGE_DOWNLOAD_DIR, `${randomUUID()}.png`)
        await saveFile(await attachToFile({ type: 'url', path: wenxinResult }), outputPath)
        await task.onResult?.(outputPath, prisma)
      }
    } finally {
      await releasePage(yuanbaoPage)
      await releasePage(wenxinPage)
    }
  }
}
