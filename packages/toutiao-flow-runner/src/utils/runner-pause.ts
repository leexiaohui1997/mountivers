import { prisma } from './db.js'

export const RUNNER_PAUSED_KEY = 'runner-paused'

/** 是否暂停调度新的角色任务 */
export async function isRunnerPaused(): Promise<boolean> {
  const row = await prisma.appState.findUnique({ where: { key: RUNNER_PAUSED_KEY } })
  return row?.value === 'true'
}

/** 设置运行器暂停状态 */
export async function setRunnerPaused(paused: boolean): Promise<void> {
  const value = paused ? 'true' : 'false'
  await prisma.appState.upsert({
    where: { key: RUNNER_PAUSED_KEY },
    update: { value },
    create: { key: RUNNER_PAUSED_KEY, value },
  })
}
