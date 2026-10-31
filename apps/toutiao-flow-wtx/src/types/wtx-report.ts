export interface WtxReportItem {
  id: string
  bookTitle: string
  topic: string
  content: string
  images: string[]
}

export interface WtxReport {
  generatedAt: string
  items: WtxReportItem[]
}

export function isWtxReport(value: unknown): value is WtxReport {
  if (!value || typeof value !== 'object') return false
  const report = value as Partial<WtxReport>
  if (typeof report.generatedAt !== 'string' || !Array.isArray(report.items)) return false

  return report.items.every((item) => {
    if (!item || typeof item !== 'object') return false
    const row = item as Partial<WtxReportItem>
    return (
      typeof row.id === 'string' &&
      typeof row.bookTitle === 'string' &&
      typeof row.topic === 'string' &&
      typeof row.content === 'string' &&
      Array.isArray(row.images) &&
      row.images.every((image) => typeof image === 'string')
    )
  })
}
