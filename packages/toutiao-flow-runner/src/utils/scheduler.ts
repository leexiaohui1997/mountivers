import { BrowserWaitTimeoutError } from './browser-wait.js'
import { cronNext } from './cron.js'
import BaseRole from './role/base.js'

/** 单个角色在调度器侧的运行时状态(与 BaseRole 声明解耦)。 */
interface Runtime {
  /** 下一次应触发时刻(毫秒);仅含 cron 的角色有值。 */
  nextRunAt?: number
  /** 当前仍在执行的 run()；同一角色可能同时有多个。 */
  activeRuns: Set<Promise<void>>
}

/**
 * 调度核心:维护角色运行态、处理 waitPrevious、并行触发、容错。
 * - tick 只负责"到点即启动",不等待角色结束,因此不同角色可以并行执行;
 * - 同一角色是否允许重入由 waitPrevious 决定:
 *   true  -> 上次仍在执行时跳过本次触发;
 *   false -> 到点直接启动新的 run，允许同一角色并发。
 * 纯时间计算委托给 cron.ts,时钟来源由调用方传入。
 */
export class Scheduler {
  private readonly state = new Map<BaseRole, Runtime>()
  private paused = false

  /** 基于当前时间初始化所有含 cron 角色的下次触发时刻。 */
  init(roles: BaseRole[], now: number): void {
    for (const role of roles) {
      if (role.cron) {
        this.state.set(role, {
          nextRunAt: cronNext(role.cron, now),
          activeRuns: new Set(),
        })
      }
    }
  }

  /** 触发所有到点角色并立即返回(不等待 run() 结束);返回本 tick 命中的角色。 */
  tick(roles: BaseRole[], now: number, opts: { paused?: boolean } = {}): BaseRole[] {
    this.paused = opts.paused ?? false

    // 暂停时只推进下次触发时间，不启动任何新任务，避免恢复后集中补跑
    if (this.paused) {
      for (const role of roles) {
        const rt = this.state.get(role)
        if (!rt || rt.nextRunAt === undefined) continue
        rt.nextRunAt = cronNext(role.cron!, now)
      }
      return []
    }

    const fired: BaseRole[] = []
    for (const role of roles) {
      const rt = this.state.get(role)
      if (!rt || rt.nextRunAt === undefined) continue // 无 cron:不参与自动调度
      if (now < rt.nextRunAt) continue

      // 冻结期内不执行；同时推进下次触发时间，避免解冻后补跑历史触发
      if (role.freezeUntil && role.freezeUntil.getTime() > now) {
        rt.nextRunAt = cronNext(role.cron!, now)
        continue
      }

      fired.push(role)
      // 基于 now 重算下次,避免停机/积压导致的历史触发堆积(misfire 不补发)
      rt.nextRunAt = cronNext(role.cron!, now)
      this.fire(role, rt)
    }
    return fired
  }

  /** 启动一次 run；waitPrevious=true 且上次仍在执行时跳过。 */
  private fire(role: BaseRole, rt: Runtime): void {
    if (role.waitPrevious && rt.activeRuns.size > 0) {
      return
    }
    this.start(role, rt)
  }

  /** 并行执行入口:不 await,失败只记录日志,结束后按需补跑。 */
  private hasRunningRoles(): boolean {
    for (const runtime of this.state.values()) {
      if (runtime.activeRuns.size > 0) return true
    }
    return false
  }

  private start(role: BaseRole, rt: Runtime): void {
    if (this.paused) return

    // 冻结可能在 run() 内部被设置；此时不再启动新的 run
    if (role.freezeUntil && role.freezeUntil.getTime() > Date.now()) {
      console.log(`[scheduler] ${role.constructor.name} 已冻结，跳过本次触发`)
      return
    }

    const run: Promise<void> = Promise.resolve()
      .then(() => role.run())
      .catch((err: unknown) => {
        if (err instanceof BrowserWaitTimeoutError) {
          console.warn(
            `[scheduler] ${role.constructor.name} 浏览器等待超时，停止本次任务: ${err.message}`,
          )
          return
        }
        console.error(`[scheduler] ${role.constructor.name} 执行失败:`, err)
      })
      .finally(() => {
        rt.activeRuns.delete(run)

        if (this.paused && !this.hasRunningRoles()) {
          console.log('[scheduler] 暂停期间所有角色任务已结束，可以安全退出')
        }
      })

    rt.activeRuns.add(run)
  }
}
