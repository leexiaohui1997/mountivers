import { spawn } from 'node:child_process'
import { copyFile, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { Prisma } from '@toutiao-flow/db'

import { isMicroHeadlineData } from '../types/micro-headline.js'
import { isOverviewJson } from '../types/overview.js'
import { prisma } from '../utils/db.js'
import BaseRole from '../utils/role/base.js'
import { getStartOfLocalDay } from '../utils/time.js'
import { getWtxReportGeneratedAt, setWtxReportGeneratedAt } from '../utils/wtx-report.js'

interface ReportImage {
  src: string
  url: string
}

interface ReportItem {
  id: string
  bookTitle: string
  topic: string
  content: string
  images: string[]
}

interface WtxReport {
  generatedAt: string
  items: ReportItem[]
}

const REPORT_DIR = 'public/generated'
const REPORT_IMAGES_DIR = 'public/generated/images'

export default class WtxReportRole extends BaseRole {
  cron = '0 0 1-5 * * *'
  waitPrevious = true

  async run(): Promise<void> {
    try {
      await this.generateReport()
    } catch (error) {
      console.error(
        `[wtx-report] 生成失败: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async generateReport(): Promise<void> {
    const wtxPath = process.env.WTX_PROJECT_PATH
    const pnpmCommand = process.env.WTX_PNPM_COMMAND
    if (!wtxPath || !pnpmCommand) {
      console.log('[wtx-report] 缺少 WTX_PROJECT_PATH 或 WTX_PNPM_COMMAND，跳过')
      return
    }

    const startOfToday = getStartOfLocalDay()
    const lastGeneratedAt = await getWtxReportGeneratedAt()
    if (lastGeneratedAt && lastGeneratedAt >= startOfToday) {
      console.log('[wtx-report] 今日已生成过报表，跳过')
      return
    }

    const rows = await prisma.microHeadline.findMany({
      where: {
        createdAt: { gte: startOfToday },
        imagesDone: true,
        data: { not: Prisma.DbNull },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        book: {
          select: { overview: true },
        },
      },
    })

    if (rows.length < 3) {
      console.log(`[wtx-report] 今日已完成生图 ${rows.length} 条，未达到 3 条`)
      return
    }

    const items: ReportItem[] = []
    const images: ReportImage[] = []
    const keepIds = new Set<string>()

    for (const row of rows) {
      if (!isMicroHeadlineData(row.data)) {
        console.warn(`[wtx-report] 跳过 data 非法的微头条: ${row.id}`)
        continue
      }

      const reportImages: string[] = []
      let valid = true

      for (const [index, image] of row.data.images.entries()) {
        if (!image.path) {
          console.warn(`[wtx-report] 跳过缺图微头条: ${row.id}, 第 ${index + 1} 张`)
          valid = false
          break
        }

        const url = `/generated/images/${row.id}/image-${index + 1}.png`
        reportImages.push(url)
        images.push({ src: image.path, url })
      }

      if (!valid) continue

      keepIds.add(row.id)
      items.push({
        id: row.id,
        bookTitle: isOverviewJson(row.book.overview) ? row.book.overview.bookTitle : '未知书籍',
        topic: row.data.topic,
        content: row.data.content,
        images: reportImages,
      })
    }

    if (items.length < 3) {
      console.log(`[wtx-report] 今日可用报表条目 ${items.length} 条，未达到 3 条`)
      return
    }

    const report: WtxReport = {
      generatedAt: new Date().toISOString(),
      items,
    }

    const reportDir = path.resolve(wtxPath, REPORT_DIR)
    const imagesDir = path.resolve(wtxPath, REPORT_IMAGES_DIR)

    await mkdir(imagesDir, { recursive: true })

    for (const image of images) {
      const id = path.basename(path.dirname(image.url))
      const targetDir = path.join(imagesDir, id)
      await mkdir(targetDir, { recursive: true })
      await copyFile(image.src, path.join(targetDir, path.basename(image.url)))
    }

    await removeOldImages(imagesDir, keepIds)

    const dataPath = path.join(reportDir, 'data.json')
    const tempPath = path.join(reportDir, 'data.json.tmp')
    await writeFile(tempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
    await rename(tempPath, dataPath)

    console.log(`[wtx-report] 报表已生成: ${dataPath}, ${items.length} 条`)

    await runCommand(pnpmCommand, ['run', 'build'], wtxPath)
    await runCommand(pnpmCommand, ['run', 'deploy'], wtxPath)

    await setWtxReportGeneratedAt(new Date())
    console.log('[wtx-report] 报表已构建并部署')
  }
}

async function removeOldImages(imagesDir: string, keepIds: Set<string>): Promise<void> {
  const entries = await readdir(imagesDir, { withFileTypes: true }).catch(() => [])

  for (const entry of entries) {
    if (keepIds.has(entry.name)) continue
    await rm(path.join(imagesDir, entry.name), { recursive: true, force: true })
    console.log(`[wtx-report] 清理旧图片: ${entry.name}`)
  }
}

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[wtx-report] 执行: ${command} ${args.join(' ')} (cwd=${cwd})`)

    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} 退出码 ${code ?? 'unknown'}`))
      }
    })
  })
}
