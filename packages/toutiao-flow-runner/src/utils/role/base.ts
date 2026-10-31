export interface RoleOptions {
  /** cron 表达式,决定该角色何时被自动触发(未设置则不参与 runRoles 自动调度)。 */
  cron?: string
  /** 上次 run 未结束时,本次到点是否在它结束后补跑一次(多次到点合并)。默认 false(跳过本次)。 */
  waitPrevious?: boolean
}

/**
 * 角色基类 —— 纯声明契约,不持有任何调度运行态。
 * 调度相关的 nextRunAt / lastRunAt / 并发控制由 scheduler 外部维护。
 */
export default class BaseRole {
  /** cron 表达式;为空表示仅手动触发。 */
  readonly cron?: string
  /** 是否需要在上次 run 结束后补跑(见 RoleOptions.waitPrevious)。 */
  readonly waitPrevious: boolean

  constructor(opts?: RoleOptions) {
    this.cron = opts?.cron
    this.waitPrevious = opts?.waitPrevious ?? false
  }

  /** 角色的执行逻辑,由调度器在到点时调用。 */
  async run(): Promise<void> {}
}
