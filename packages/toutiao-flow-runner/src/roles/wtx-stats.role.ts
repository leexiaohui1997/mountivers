import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { prisma } from '../utils/db.js'
import { getYesterdayDateKey } from '../utils/publish-stat.js'
import BaseRole from '../utils/role/base.js'
import { enqueueWtxBuildDeploy } from '../utils/wtx-deploy.js'
import { getWtxStatsGeneratedDate, setWtxStatsGeneratedDate } from '../utils/wtx-stats.js'

interface WtxStats {
  generatedAt: string
  date: string
  successCount: number
  overviewCount: number
  articleCount: number
  imageCount: number
  collectionCount: number
  bookDoneCount: number
}

const REPORT_DIR = 'public/generated'

/**
 * 每日统计角色：按小时检查，成功生成一次后当天不再重复。
 * 与微头条报表解耦，即使今天没有微头条也会正常更新 stats.json。
 */
export default class WtxStatsRole extends BaseRole {
  cron = '0 0 * * * *'
  waitPrevious = true

  async run(): Promise<void> {
    try {
      await this.generateStats()
    } catch (error) {
      console.error(
        `[wtx-stats] 生成失败: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  private async generateStats(): Promise<void> {
    const wtxPath = process.env.WTX_PROJECT_PATH
    const pnpmCommand = process.env.WTX_PNPM_COMMAND
    if (!wtxPath || !pnpmCommand) {
      console.log('[wtx-stats] 缺少 WTX_PROJECT_PATH 或 WTX_PNPM_COMMAND，跳过')
      return
    }

    const date = getYesterdayDateKey()
    const lastDate = await getWtxStatsGeneratedDate()
    if (lastDate === date) {
      console.log(`[wtx-stats] ${date} 统计已生成并部署，跳过`)
      return
    }

    const row = await prisma.publishStat.findUnique({ where: { date } })
    const stats: WtxStats = {
      generatedAt: new Date().toISOString(),
      date,
      successCount: row?.successCount ?? 0,
      overviewCount: row?.overviewCount ?? 0,
      articleCount: row?.articleCount ?? 0,
      imageCount: row?.imageCount ?? 0,
      collectionCount: row?.collectionCount ?? 0,
      bookDoneCount: row?.bookDoneCount ?? 0,
    }

    const reportDir = path.resolve(wtxPath, REPORT_DIR)
    const dataPath = path.join(reportDir, 'stats.json')
    const tempPath = path.join(reportDir, 'stats.json.tmp')

    await mkdir(reportDir, { recursive: true })
    await writeFile(tempPath, `${JSON.stringify(stats, null, 2)}\n`, 'utf8')
    await rename(tempPath, dataPath)

    console.log(`[wtx-stats] 已生成: ${dataPath}, date=${date}`)

    await enqueueWtxBuildDeploy('wtx-stats', wtxPath, pnpmCommand)
    await setWtxStatsGeneratedDate(date)

    console.log('[wtx-stats] 统计报表已构建并部署')
  }
}
