import { prisma } from './db.js'

/** 本地时区日期键：YYYY-MM-DD */
export function getPublishDateKey(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** 读取指定日期（默认今天）的发布成功次数 */
export async function getPublishSuccessCount(now = new Date()): Promise<number> {
  const row = await prisma.publishStat.findUnique({
    where: { date: getPublishDateKey(now) },
  })
  return row?.successCount ?? 0
}

/** 发布成功后累加当日统计 */
export async function incrementPublishSuccess(now = new Date()): Promise<number> {
  const row = await prisma.publishStat.upsert({
    where: { date: getPublishDateKey(now) },
    update: { successCount: { increment: 1 } },
    create: { date: getPublishDateKey(now), successCount: 1 },
  })
  return row.successCount
}
