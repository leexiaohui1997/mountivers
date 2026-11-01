import { Prisma } from '@toutiao-flow/db'

import { prisma } from './db.js'

export interface MarkEngineLimitedOptions {
  /** 限额原因：credit-exhausted / professional-membership / manual */
  reason?: string | null
  /** 预计恢复时间；null 表示需要手动清除 */
  until?: Date | null
  /** 原始状态快照 */
  metadata?: Prisma.InputJsonValue
}

/**
 * 读取引擎限额记录。
 * 记录不存在或已到恢复时间时返回 null；过期记录会顺带删除。
 */
export async function getEngineLimit(engine: string, now = Date.now()) {
  const row = await prisma.engineLimit.findUnique({ where: { engine } })
  if (!row) return null

  if (row.until && row.until.getTime() <= now) {
    await clearEngineLimit(engine)
    return null
  }

  return row
}

/** 当前引擎是否处于限额状态 */
export async function isEngineLimited(engine: string, now = Date.now()): Promise<boolean> {
  return (await getEngineLimit(engine, now)) !== null
}

/** 写入或更新引擎限额记录 */
export async function markEngineLimited(
  engine: string,
  options: MarkEngineLimitedOptions = {},
): Promise<void> {
  const data = {
    reason: options.reason ?? null,
    until: options.until ?? null,
    metadata: options.metadata ?? Prisma.DbNull,
    limitedAt: new Date(),
  }

  await prisma.engineLimit.upsert({
    where: { engine },
    update: data,
    create: { engine, ...data },
  })
}

/** 清除引擎限额记录 */
export async function clearEngineLimit(engine: string): Promise<void> {
  await prisma.engineLimit.deleteMany({ where: { engine } })
}
