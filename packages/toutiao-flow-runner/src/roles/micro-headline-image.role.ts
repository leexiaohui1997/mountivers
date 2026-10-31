import { existsSync } from 'node:fs'
import path from 'node:path'

import { Prisma } from '@toutiao-flow/db'

import { isMicroHeadlineData, type MicroHeadlineData } from '../types/micro-headline.js'
import { browserQueue } from '../utils/browser-queue.js'
import { prisma } from '../utils/db.js'
import { IMAGE_DOWNLOAD_DIR } from '../utils/env.js'
import { runImageTasks, type ImageTask } from '../utils/image-runner.js'
import BaseRole from '../utils/role/base.js'
import { ROLE_PRIORITY } from '../utils/role-priority.js'

interface ImageSpec {
  index: number
  outputPath: string
}

export default class MicroHeadlineImageRole extends BaseRole {
  cron = '* * * * * ?'
  waitPrevious = true
  priority = ROLE_PRIORITY.MICRO_HEADLINE_IMAGE

  async run(): Promise<void> {
    const item = await prisma.microHeadline.findFirst({
      where: {
        imagesDone: false,
        data: { not: Prisma.DbNull },
      },
      orderBy: { createdAt: 'asc' },
      include: { book: true },
    })
    if (!item) return

    if (!isMicroHeadlineData(item.data)) {
      await this.recordFailure(item.id, '微头条 data 不是合法 schema')
      return
    }

    const state = { data: item.data }
    const dir = path.resolve(IMAGE_DOWNLOAD_DIR, item.bookId, 'micro-headline', item.id)
    const specs: ImageSpec[] = state.data.images.map((_, index) => ({
      index,
      outputPath: path.join(dir, `image-${index + 1}.png`),
    }))

    const missing = specs.filter((spec) => !this.isDone(state.data, spec))
    if (!missing.length) {
      await this.markDone(item.id, state.data)
      console.log(`[micro-headline-image] 图片已齐备: ${item.id}`)
      return
    }

    console.log(
      `[micro-headline-image] 开始: ${item.id}, 缺 ${missing.length} 张: ${missing
        .map((spec) => spec.index + 1)
        .join(', ')}`,
    )

    const tasks: ImageTask[] = missing.map((spec) => ({
      label: `micro-headline:${item.id}:image-${spec.index + 1}`,
      prompt: () => state.data.images[spec.index].prompt,
      outputPath: () => spec.outputPath,
      sessionUrl: () => item.book.sessionUrl,
      onPromptFixed: async (fixedPrompt) => {
        state.data = updateImage(state.data, spec.index, (image) => ({
          ...image,
          prompt: fixedPrompt,
        }))
        await prisma.microHeadline.update({
          where: { id: item.id },
          data: { data: state.data },
        })
      },
      onResult: async (filePath) => {
        state.data = updateImage(state.data, spec.index, (image) => ({
          ...image,
          path: filePath,
        }))
        await prisma.microHeadline.update({
          where: { id: item.id },
          data: { data: state.data },
        })
      },
    }))

    try {
      await browserQueue.run(
        `micro-headline-image:${item.id}`,
        async () => {
          await runImageTasks(tasks)
        },
        this.priority,
      )
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      await this.recordFailure(item.id, `生成异常：${reason}`)
      return
    }

    const remaining = specs.filter((spec) => !this.isDone(state.data, spec))
    if (remaining.length) {
      await this.recordFailure(
        item.id,
        `仍有 ${remaining.length} 张图片缺失：${remaining
          .map((spec) => spec.index + 1)
          .join('、')}`,
      )
      return
    }

    await this.markDone(item.id, state.data)
    console.log(`[micro-headline-image] 完成: ${item.id}`)
  }

  private isDone(data: MicroHeadlineData, spec: ImageSpec): boolean {
    const image = data.images[spec.index]
    return Boolean(image?.path && existsSync(image.path))
  }

  private async markDone(id: string, data: MicroHeadlineData): Promise<void> {
    await prisma.microHeadline.update({
      where: { id },
      data: {
        data,
        imagesDone: true,
        imageAttempts: 0,
        imageLastError: null,
      },
    })
  }

  private async recordFailure(id: string, reason: string): Promise<void> {
    await prisma.microHeadline.update({
      where: { id },
      data: {
        imageAttempts: { increment: 1 },
        imageLastError: reason.slice(0, 2000),
      },
    })
    console.error(`[micro-headline-image] 未完成: ${id}: ${reason}`)
  }
}

function updateImage(
  data: MicroHeadlineData,
  index: number,
  update: (image: MicroHeadlineData['images'][number]) => MicroHeadlineData['images'][number],
): MicroHeadlineData {
  return {
    ...data,
    images: data.images.map((image, current) => (current === index ? update(image) : image)),
  }
}
