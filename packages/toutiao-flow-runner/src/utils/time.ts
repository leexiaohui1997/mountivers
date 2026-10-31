/** 本地时区的“明日零点” */
export function getNextLocalMidnight(now = new Date()): Date {
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return next
}
