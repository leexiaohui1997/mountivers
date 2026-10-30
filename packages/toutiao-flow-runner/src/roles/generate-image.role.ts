import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { BookStatus, PrismaClient } from '@toutiao-flow/db'
import { Page } from 'playwright'

import WenxinPage from '../browser-pages/wenxin.js'
import YuanBaoPage from '../browser-pages/yuanbao.js'
import { isCheckJson, type CheckJson } from '../types/check.js'
import { isFixPromptJson } from '../types/fix-prompt.js'
import { isOverviewJson } from '../types/overview.js'
import { attachToFile, saveFile } from '../utils/attach.js'
import { getPage, releasePage } from '../utils/browser.js'
import { prisma } from '../utils/db.js'
import { IMAGE_DOWNLOAD_DIR } from '../utils/env.js'
import { extractJsonBlock } from '../utils/markdown.js'
import BaseRole from '../utils/role/base.js'
import { renderTemplate } from '../utils/template.js'

type Task = {
  prompt: () => string
  attachPath?: () => string | null
  /** 修词会话 URL(通常为 Book 的 sessionUrl);缺省用元宝默认新会话 */
  sessionUrl?: () => string | null
  /** 提示词修正后回调:闭包内负责覆盖 overview 并落库 */
  onPromptFixed?: (fixedPrompt: string) => Promise<void>
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
          prompt: () => overview.xhsCollectionCoverPrompt,
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

  async getArticleSchedule(): Promise<Task[]> {
    return []
  }

  async generateImageYuanbao(tasks: Task[]) {
    if (!tasks.length) return
    const yuanbaoPage = await getPage('gen-img-yuanbao')
    const wenxinPage = await getPage('gen-img-yuanbao-wenxin')
    const checkPage = await getPage('yuanbao-check-image')
    // 修词页面惰性创建,只在出图失败时才建会话
    let fixPage: Page | null = null

    try {
      const $wenxinPage = new WenxinPage(wenxinPage)
      await $wenxinPage.newSession()
      const $yuanbaoPage = new YuanBaoPage(yuanbaoPage)
      await $yuanbaoPage.newSession()
      const $checkPage = new YuanBaoPage(checkPage)
      await $checkPage.newSession()
      let $fixPage: YuanBaoPage | null = null

      await yuanbaoPage.bringToFront()
      await $yuanbaoPage.setImageMode()

      for (const task of tasks) {
        let prompt = task.prompt()
        let outputPath = ''
        let passed = false
        let tryTimes = 0

        // 单任务闭环:出图 → 去水印 → 校验;校验不通过采纳 suggestion 重跑,最多 3 次
        while (tryTimes < 3 && !passed) {
          tryTimes++

          // 元宝出图
          await yuanbaoPage.bringToFront()
          await $yuanbaoPage.clearEditor()
          const attachPath = task.attachPath?.()
          if (attachPath) {
            const file = await attachToFile({ type: 'file', path: attachPath })
            await $yuanbaoPage.uploadImage(file)
          }
          await $yuanbaoPage.input(prompt)
          await $yuanbaoPage.send()

          let src = ''
          try {
            src = await $yuanbaoPage.getImageAnswer()
          } catch (e) {
            const detail = e instanceof Error ? e.message : String(e)
            console.log(`[gen-image] 第 ${tryTimes} 次出图失败，按提示词违规处理: ${detail}`)

            // 调起修词 AI(复用 Book 的元宝会话)，改写提示词后覆盖原 overview 并重跑
            try {
              if (!fixPage) {
                fixPage = await getPage('fix-prompt-yuanbao')
                $fixPage = new YuanBaoPage(fixPage)
              }
              const fixed = await this.fixPrompt($fixPage!, prompt, task.sessionUrl?.())
              if (fixed) {
                prompt = fixed
                await task.onPromptFixed?.(fixed)
                console.log(`[gen-image] 提示词已改写，重跑该任务`)
              }
            } catch (fixErr) {
              console.error(
                `[gen-image] 修词失败: ${fixErr instanceof Error ? fixErr.message : String(fixErr)}`,
              )
            }
            continue
          }

          // 文心去水印
          const yuanbaoImage = await attachToFile({ type: 'url', path: src, filename: 'image.png' })
          let wenxinResult = ''
          try {
            wenxinResult = await this.removeWaterMark($wenxinPage, yuanbaoImage)
          } catch (e) {
            console.log(`[gen-image] 第 ${tryTimes} 次去水印失败: ${(e as Error).message}`)
            continue
          }

          // 校验
          const file = await attachToFile({
            type: 'url',
            path: wenxinResult,
            filename: 'image.png',
          })
          const check = await this.checkImage($checkPage, file, prompt)
          const brief = check.checks
            .map((c) => `${c.name}${c.pass ? '✓' : `✗(${c.reason})`}`)
            .join(' ')
          console.log(`[gen-image] 第 ${tryTimes} 次校验结果(pass=${check.pass}): ${brief}`)

          if (check.pass) {
            passed = true
            outputPath = path.resolve(IMAGE_DOWNLOAD_DIR, `${randomUUID()}.png`)
            await saveFile(file, outputPath)
            break
          }

          // 不通过:采纳 suggestion 调整提示词,重跑当前 task
          if (check.suggestion) {
            prompt = `${prompt}\n补充要求：${check.suggestion}`
            console.log(`[gen-image] 采纳校验建议，调整提示词后重试: ${check.suggestion}`)
          }
        }

        if (passed) {
          await task.onResult?.(outputPath, prisma)
        } else {
          console.error(`[gen-image] 任务重试 3 次仍未通过，放弃该任务: ${prompt}`)
          await task.onFail?.()
        }
      }
    } finally {
      await releasePage(yuanbaoPage)
      await releasePage(wenxinPage)
      await releasePage(checkPage)
      if (fixPage) await releasePage(fixPage)
    }
  }

  /**
   * 违规提示词改写:复用 Book 的元宝会话(缺省用默认会话),
   * 让 AI 改写规避违规表述,返回改写后的提示词文本。
   */
  async fixPrompt(
    $fixPage: YuanBaoPage,
    prompt: string,
    sessionUrl?: string | null,
  ): Promise<string> {
    await $fixPage.newSession(sessionUrl ?? undefined)
    await $fixPage.clearEditor()

    let reTryTimes = 0
    while (reTryTimes < 3) {
      await $fixPage.input(await renderTemplate('fix-prompt.prompt', { prompt }))
      await $fixPage.send()

      const answer = await $fixPage.getAnswer()
      const json = extractJsonBlock(answer)
      if (!json) {
        await $fixPage.clearEditor()
        await $fixPage.input('请以 json 代码块的格式回复')
        await $fixPage.send()
        reTryTimes++
        continue
      }

      let failReason = ''
      if (isFixPromptJson(json, (reason) => (failReason = reason))) {
        return json.prompt
      }

      await $fixPage.clearEditor()
      await $fixPage.input(`json 格式错误，请调整：${failReason}`)
      await $fixPage.send()
      reTryTimes++
    }

    throw new Error('修词失败：AI 连续 3 次未返回有效提示词 JSON')
  }

  /** 图片质量校验:上传图片 + 渲染后的校验提示词,循环直至拿到合法 check.json */
  async checkImage($checkPage: YuanBaoPage, file: File, prompt: string): Promise<CheckJson> {
    await $checkPage.newSession()
    await $checkPage.clearEditor()

    while (true) {
      await $checkPage.uploadFile(file, true)
      await $checkPage.input(await renderTemplate('image-check.prompt', { prompt }))
      await $checkPage.send()

      const answer = await $checkPage.getAnswer()
      const json = extractJsonBlock(answer)
      if (!json) {
        await $checkPage.clearEditor()
        await $checkPage.input('请以 json 代码块的格式回复')
        await $checkPage.send()
        continue
      }

      let failReason = ''
      if (isCheckJson(json, (reason) => (failReason = reason))) {
        return json
      }

      await $checkPage.clearEditor()
      await $checkPage.input(`json 格式错误，请调整：${failReason}`)
      await $checkPage.send()
    }
  }

  /** 文心一言去水印:粘贴图片 + "去水印"发送,最多重试 3 次,返回去水印后图片 URL */
  async removeWaterMark($wenxinPage: WenxinPage, image: File): Promise<string> {
    await $wenxinPage.page.bringToFront()

    let reTryTimes = 0
    while (reTryTimes < 3) {
      await $wenxinPage.pasteImage(image)
      await $wenxinPage.input('去水印')
      await $wenxinPage.send()
      try {
        return await $wenxinPage.getImageAnswer()
      } catch {
        reTryTimes++
      }
    }

    throw new Error('文心一言去水印失败(重试 3 次)')
  }
}
