import { prisma } from './db.js'

export const WTX_REPORT_LAST_GENERATED_KEY = 'wtx-report-last-generated-at'

/** 读取上一次成功生成 wtx 报表的时间 */
export async function getWtxReportGeneratedAt(): Promise<Date | null> {
  const row = await prisma.appState.findUnique({
    where: { key: WTX_REPORT_LAST_GENERATED_KEY },
  })
  if (!row?.value) return null

  const date = new Date(row.value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** 报表成功构建并部署后，记录生成时间 */
export async function setWtxReportGeneratedAt(date = new Date()): Promise<void> {
  const value = date.toISOString()

  await prisma.appState.upsert({
    where: { key: WTX_REPORT_LAST_GENERATED_KEY },
    update: { value },
    create: { key: WTX_REPORT_LAST_GENERATED_KEY, value },
  })
}

export async function clearWtxReportGeneratedAt(): Promise<void> {
  await prisma.appState.updateMany({
    where: { key: WTX_REPORT_LAST_GENERATED_KEY },
    data: { value: null },
  })
}
