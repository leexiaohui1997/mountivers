import { prisma } from './db.js'
import { getNextLocalMidnight } from './time.js'

/** 即梦积分状态 key */
export const JIMENG_CREDIT_KEY = 'jimeng-credit'

export interface JimengCreditState {
  /** 剩余积分（用于判断是否还能继续使用即梦） */
  remainingCredit: number
  /** 使用期限（ISO 字符串，通常为明日零点） */
  expiresAt: string
}

/**
 * 读取即梦积分状态。
 * 无记录、JSON 非法、字段非法或已过期时返回 null，并清空失效记录。
 */
export async function getJimengCreditState(now = Date.now()): Promise<JimengCreditState | null> {
  const row = await prisma.appState.findUnique({ where: { key: JIMENG_CREDIT_KEY } })
  if (!row?.value) return null

  try {
    const parsed = JSON.parse(row.value) as Partial<JimengCreditState>
    const expiresAt = typeof parsed.expiresAt === 'string' ? Date.parse(parsed.expiresAt) : NaN

    if (typeof parsed.remainingCredit !== 'number' || Number.isNaN(expiresAt) || expiresAt <= now) {
      await clearJimengCreditState()
      return null
    }

    return {
      remainingCredit: parsed.remainingCredit,
      expiresAt: new Date(expiresAt).toISOString(),
    }
  } catch {
    await clearJimengCreditState()
    return null
  }
}

/** 写入即梦积分状态；expiresAt 默认明日零点 */
export async function setJimengCreditState(
  remainingCredit: number,
  expiresAt: Date = getNextLocalMidnight(),
): Promise<void> {
  const value = JSON.stringify({
    remainingCredit: Math.max(0, remainingCredit),
    expiresAt: expiresAt.toISOString(),
  } satisfies JimengCreditState)

  await prisma.appState.upsert({
    where: { key: JIMENG_CREDIT_KEY },
    update: { value },
    create: { key: JIMENG_CREDIT_KEY, value },
  })
}

/** 标记今日积分已不可用（默认剩余 0），有效到明日零点 */
export async function markJimengCreditExhausted(remainingCredit = 0): Promise<void> {
  await setJimengCreditState(remainingCredit, getNextLocalMidnight())
}

/** 成功使用一次即梦后扣减剩余积分 */
export async function consumeJimengCredit(): Promise<void> {
  const state = await getJimengCreditState()
  if (!state) return

  await setJimengCreditState(state.remainingCredit - 1, new Date(state.expiresAt))
}

/** 清空即梦积分状态 */
export async function clearJimengCreditState(): Promise<void> {
  await prisma.appState.updateMany({
    where: { key: JIMENG_CREDIT_KEY },
    data: { value: null },
  })
}
