import { cronNext } from './cron.js'
import BaseRole from './role/base.js'

/** 单个角色在调度器侧的运行时状态(与 BaseRole 声明解耦)。 */
interface Runtime {
  /** 下一次应触发时刻(毫秒);仅含 cron 的角色有值。 */
  nextRunAt?: number
  /** 正在执行的 run() Promise;为空表示空闲。 */
  running?: Promise<void>
}

/**
 * 调度核心:维护角色运行态、处理 waitPrevious、顺序触发、容错。
 * 纯时间计算委托给 cron.ts,时钟来源由调用方传入。
 */
export class Scheduler {
  private readonly state = new Map<BaseRole, Runtime>()

  /** 基于当前时间初始化所有含 cron 角色的下次触发时刻。 */
  init(roles: BaseRole[], now: number): void {
    for (const role of roles) {
      if (role.cron) {
        this.state.set(role, { nextRunAt: cronNext(role.cron, now) })
      }
    }
  }

  /** 当前 tick:触发所有到点角色,顺序执行;返回本 tick 命中的角色。 */
  async tick(roles: BaseRole[], now: number): Promise<BaseRole[]> {
    const fired: BaseRole[] = []
    for (const role of roles) {
      const rt = this.state.get(role)
      if (!rt || rt.nextRunAt === undefined) continue // 无 cron:不参与自动调度
      if (now < rt.nextRunAt) continue

      await this.fire(role, rt)
      fired.push(role)
      // 基于 now 重算下次,避免停机/积压导致的历史触发堆积(misfire 不补发)
      rt.nextRunAt = cronNext(role.cron!, now)
    }
    return fired
  }

  /** 触发单个角色(含 waitPrevious 语义 + 容错)。 */
  private async fire(role: BaseRole, rt: Runtime): Promise<void> {
    if (rt.running) {
      if (role.waitPrevious) {
        await rt.running // 等上次结束后再触发本次
      } else {
        return // 上次未结束:本次跳过
      }
    }

    const task = Promise.resolve()
      .then(() => role.run())
      .catch((err: unknown) => console.error(`[scheduler] ${role.constructor.name} 执行失败:`, err))
      .finally(() => {
        rt.running = undefined
      })

    rt.running = task
    await task // 顺序执行:等本角色跑完再进入下一个
  }
}
