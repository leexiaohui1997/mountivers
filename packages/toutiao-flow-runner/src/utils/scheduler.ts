import { cronNext } from './cron.js'
import BaseRole from './role/base.js'

/** 单个角色在调度器侧的运行时状态(与 BaseRole 声明解耦)。 */
interface Runtime {
  /** 下一次应触发时刻(毫秒);仅含 cron 的角色有值。 */
  nextRunAt?: number
  /** 正在执行的 run() Promise;为空表示空闲。 */
  running?: Promise<void>
  /** 运行期间又到点且 waitPrevious=true 时置位,结束后补跑一次(多次到点合并)。 */
  rerun?: boolean
}

/**
 * 调度核心:维护角色运行态、处理 waitPrevious、并行触发、容错。
 * - tick 只负责"到点即启动",不等待角色结束,因此不同角色可以并行执行;
 * - 同一角色是否允许重入由 waitPrevious 决定:
 *   true  -> 本次到点合并为"上次结束后补跑一次";
 *   false -> 本次到点直接跳过。
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

  /** 触发所有到点角色并立即返回(不等待 run() 结束);返回本 tick 命中的角色。 */
  tick(roles: BaseRole[], now: number): BaseRole[] {
    const fired: BaseRole[] = []
    for (const role of roles) {
      const rt = this.state.get(role)
      if (!rt || rt.nextRunAt === undefined) continue // 无 cron:不参与自动调度
      if (now < rt.nextRunAt) continue

      fired.push(role)
      // 基于 now 重算下次,避免停机/积压导致的历史触发堆积(misfire 不补发)
      rt.nextRunAt = cronNext(role.cron!, now)
      this.fire(role, rt)
    }
    return fired
  }

  /** 启动一次 run;该角色正在执行时按 waitPrevious 决定补跑还是跳过。 */
  private fire(role: BaseRole, rt: Runtime): void {
    if (rt.running) {
      if (role.waitPrevious) {
        rt.rerun = true // 合并到"上次结束后补跑一次",避免运行期间堆积多次触发
      }
      return
    }
    this.start(role, rt)
  }

  /** 并行执行入口:不 await,失败只记录日志,结束后按需补跑。 */
  private start(role: BaseRole, rt: Runtime): void {
    rt.rerun = false
    rt.running = Promise.resolve()
      .then(() => role.run())
      .catch((err: unknown) => console.error(`[scheduler] ${role.constructor.name} 执行失败:`, err))
      .finally(() => {
        rt.running = undefined
        if (rt.rerun) {
          this.start(role, rt)
        }
      })
  }
}
