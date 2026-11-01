import { prisma } from './db.js'

/** 千问额度状态 key */
export const QIANWEN_CREDIT_KEY = 'qianwen-credit-limit'

export interface QianwenCreditState {
  /** 检测到额度限制的时间（ISO 字符串） */
  blockedAt: string
  /** 额度恢复间隔（毫秒） */
  recoveryMs: number
  /** 预计恢复时间（ISO 字符串） */
  until: string
}

/**
 * 记录一次千问额度限制：写入检测时间与预计恢复时间。
 * 返回预计恢复时间，便于调用方记录日志。
 */
export async function recordQianwenCreditLimit(
  recoveryMs: number,
  now = new Date(),
): Promise<Date> {
  const until = new Date(now.getTime() + recoveryMs)
  const value = JSON.stringify({
    blockedAt: now.toISOString(),
    recoveryMs,
    until: until.toISOString(),
  } satisfies QianwenCreditState)

  await prisma.appState.upsert({
    where: { key: QIANWEN_CREDIT_KEY },
    update: { value },
    create: { key: QIANWEN_CREDIT_KEY, value },
  })

  return until
}

/**
 * 读取千问额度状态；无记录、格式非法或已过恢复时间返回 null。
 * 过期的记录会顺带清空，避免后续误判。
 */
export async function getQianwenCreditState(now = Date.now()): Promise<QianwenCreditState | null> {
  const row = await prisma.appState.findUnique({ where: { key: QIANWEN_CREDIT_KEY } })
  if (!row?.value) return null

  try {
    const parsed = JSON.parse(row.value) as Partial<QianwenCreditState>
    const until = typeof parsed.until === 'string' ? Date.parse(parsed.until) : NaN

    if (
      typeof parsed.blockedAt !== 'string' ||
      typeof parsed.recoveryMs !== 'number' ||
      Number.isNaN(until) ||
      until <= now
    ) {
      await clearQianwenCreditState()
      return null
    }

    return {
      blockedAt: parsed.blockedAt,
      recoveryMs: parsed.recoveryMs,
      until: new Date(until).toISOString(),
    }
  } catch {
    await clearQianwenCreditState()
    return null
  }
}

/** 清空千问额度状态 */
export async function clearQianwenCreditState(): Promise<void> {
  await prisma.appState.updateMany({
    where: { key: QIANWEN_CREDIT_KEY },
    data: { value: null },
  })
}
