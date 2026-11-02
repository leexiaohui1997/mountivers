import { CommandGroup } from '../decorators/command-group.js'
import { Command } from '../decorators/command.js'
import { prisma } from '../utils/db.js'

const RUNNER_PAUSED_KEY = 'runner-paused'

async function readPaused(): Promise<boolean> {
  const row = await prisma.appState.findUnique({ where: { key: RUNNER_PAUSED_KEY } })
  return row?.value === 'true'
}

async function writePaused(paused: boolean): Promise<void> {
  await prisma.appState.upsert({
    where: { key: RUNNER_PAUSED_KEY },
    update: { value: paused ? 'true' : 'false' },
    create: { key: RUNNER_PAUSED_KEY, value: paused ? 'true' : 'false' },
  })
}

@CommandGroup('runner', '运行控制')
export default class RunnerCommands {
  @Command('pause', '暂停调度新的角色任务；当前任务继续执行')
  async pause(): Promise<void> {
    await writePaused(true)
    console.log('runner 已暂停：不再启动新的角色任务，当前任务会继续执行')
  }

  @Command('resume', '恢复调度角色任务')
  async resume(): Promise<void> {
    await writePaused(false)
    console.log('runner 已恢复：继续调度角色任务')
  }

  @Command('status', '查看 runner 是否暂停')
  async status(): Promise<void> {
    const paused = await readPaused()
    console.log(paused ? 'runner 状态：已暂停' : 'runner 状态：运行中')
  }

  @Command('toggle', '切换 runner 暂停状态')
  async toggle(): Promise<void> {
    const next = !(await readPaused())
    await writePaused(next)
    console.log(next ? 'runner 已暂停：不再启动新的角色任务' : 'runner 已恢复：继续调度角色任务')
  }
}
