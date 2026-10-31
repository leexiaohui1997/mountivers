import { prisma } from './db.js'

/** 头条每日发布限额状态 key */
export const PUBLISH_LIMIT_KEY = 'toutiao-publish-limit'

/** 本地时区的“明日零点” */
export function getNextLocalMidnight(now = new Date()): Date {
  const next = new Date(now)
  next.setHours(24, 0, 0, 0)
  return next
}

/**
 * 读取发布限额；已过期或格式非法的值会自动清空并返回 null。
 */
export async function getPublishLimitUntil(now = Date.now()): Promise<Date | null> {
  const state = await prisma.appState.findUnique({ where: { key: PUBLISH_LIMIT_KEY } })
  if (!state?.value) return null

  const until = new Date(state.value)
  if (Number.isNaN(until.getTime()) || until.getTime() <= now) {
    await clearPublishLimit()
    return null
  }
  return until
}

/** 写入发布限额截止时间（ISO 字符串） */
export async function setPublishLimitUntil(until: Date): Promise<void> {
  const value = until.toISOString()
  await prisma.appState.upsert({
    where: { key: PUBLISH_LIMIT_KEY },
    update: { value },
    create: { key: PUBLISH_LIMIT_KEY, value },
  })
}

/** 清空发布限额 */
export async function clearPublishLimit(): Promise<void> {
  await prisma.appState.updateMany({
    where: { key: PUBLISH_LIMIT_KEY },
    data: { value: null },
  })
}
