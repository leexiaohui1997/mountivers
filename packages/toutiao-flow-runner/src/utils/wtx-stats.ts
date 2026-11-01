import { prisma } from './db.js'

export const WTX_STATS_LAST_GENERATED_KEY = 'wtx-stats-last-generated-date'

/** 读取上一次成功生成 wtx 统计数据的日期键 */
export async function getWtxStatsGeneratedDate(): Promise<string | null> {
  const row = await prisma.appState.findUnique({
    where: { key: WTX_STATS_LAST_GENERATED_KEY },
  })
  return row?.value || null
}

/** 记录已成功生成并部署的统计日期 */
export async function setWtxStatsGeneratedDate(date: string): Promise<void> {
  await prisma.appState.upsert({
    where: { key: WTX_STATS_LAST_GENERATED_KEY },
    update: { value: date },
    create: { key: WTX_STATS_LAST_GENERATED_KEY, value: date },
  })
}

export async function clearWtxStatsGeneratedDate(): Promise<void> {
  await prisma.appState.updateMany({
    where: { key: WTX_STATS_LAST_GENERATED_KEY },
    data: { value: null },
  })
}
