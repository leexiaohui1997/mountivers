export interface WtxStats {
  generatedAt: string
  date: string
  successCount: number
  overviewCount: number
  articleCount: number
  imageCount: number
  collectionCount: number
  bookDoneCount: number
}

export function isWtxStats(value: unknown): value is WtxStats {
  if (!value || typeof value !== 'object') return false
  const stats = value as Partial<WtxStats>

  return (
    typeof stats.generatedAt === 'string' &&
    typeof stats.date === 'string' &&
    typeof stats.successCount === 'number' &&
    typeof stats.overviewCount === 'number' &&
    typeof stats.articleCount === 'number' &&
    typeof stats.imageCount === 'number' &&
    typeof stats.collectionCount === 'number' &&
    typeof stats.bookDoneCount === 'number'
  )
}
