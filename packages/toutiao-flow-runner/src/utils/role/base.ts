export interface RoleOptions {
  /** cron 表达式,决定该角色何时被自动触发(未设置则不参与 runRoles 自动调度)。 */
  cron?: string
  /**
   * 上次 run 未结束时，本次到点是否跳过。
   * true: 上次未结束则跳过本次触发；
   * false: 无论上次是否结束，到点都启动新的 run。
   * 默认 false。
   */
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
  /** 上次 run 未结束时是否跳过本次触发；false 表示允许同一角色并发运行。 */
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
