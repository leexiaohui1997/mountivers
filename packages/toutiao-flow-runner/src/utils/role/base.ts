export interface RoleOptions {
  /** cron 表达式,决定该角色何时被自动触发(未设置则不参与 runRoles 自动调度)。 */
  cron?: string
  /** 上次 run 未结束时,本次到点是否在它结束后补跑一次(多次到点合并)。默认 false(跳过本次)。 */
  waitPrevious?: boolean
  /** 冻结截止时间；有值且晚于当前时间时，调度器跳过该角色。默认 null。 */
  freezeUntil?: Date | null
  /** 调度优先级，数字越大越先执行。默认 0。 */
  priority?: number
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
  /**
   * 冻结截止时间；有值且晚于当前时间时，调度器不执行该角色。
   * 可在运行时由角色或外部逻辑修改，null 表示未冻结。
   */
  freezeUntil: Date | null
  /** 调度优先级，数字越大越先执行。 */
  priority: number

  constructor(opts?: RoleOptions) {
    this.cron = opts?.cron
    this.waitPrevious = opts?.waitPrevious ?? false
    this.freezeUntil = opts?.freezeUntil ?? null
    this.priority = opts?.priority ?? 0
  }

  /** 角色的执行逻辑,由调度器在到点时调用。 */
  async run(): Promise<void> {}
}
