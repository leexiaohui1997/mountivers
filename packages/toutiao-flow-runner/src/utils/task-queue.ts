/**
 * 通用串行任务队列。
 *
 * 把不适合并发执行的异步操作按提交顺序逐个执行，例如：
 * - 共享同一个 Chromium 实例的浏览器自动化；
 * - 串行写同一个文件 / 同一个外部系统；
 * - 有速率限制、需要排队调用的接口。
 *
 * 本模块不依赖浏览器或任何业务类型，可独立复用。
 *
 * 使用约束：
 * 1. 任务内部不要对「同一个队列」await run()——那会等待自己释放槽位而死锁；
 *    需要串行子任务时，在任务内直接顺序 await，或另建一个队列。
 * 2. 队列不内置超时/取消：一旦释放槽位，底层操作可能仍在跑，会破坏串行语义。
 *    任务自身必须有超时（Playwright 自带默认超时），否则队列会一直等它。
 */

/** 队列生命周期回调，用于日志、埋点或测试。回调抛错不会影响队列推进。 */
export interface TaskQueueHooks {
  /** 任务出队、即将执行。pending 为仍在排队的任务数（不含当前任务）。 */
  onStart?: (label: string, pending: number) => void
  /** 任务结束（成功或失败都会触发）。error 为失败原因，成功时为 undefined。 */
  onFinish?: (label: string, durationMs: number, error: unknown, pending: number) => void
}

interface QueueItem {
  label: string
  task: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

export class TaskQueue {
  private readonly items: QueueItem[] = []
  private readonly hooks: TaskQueueHooks
  private running = false
  private idleWaiters: Array<() => void> = []

  constructor(hooks: TaskQueueHooks = {}) {
    this.hooks = hooks
  }

  /** 仍在排队、尚未开始的任务数（不含正在执行的那个）。 */
  get size(): number {
    return this.items.length
  }

  /** 当前是否有任务正在执行。 */
  get isRunning(): boolean {
    return this.running
  }

  /**
   * 提交一个任务，返回该任务自身的结果。
   * 任务按提交顺序串行执行，前一个结束（成功或失败）后才开始下一个。
   */
  run<T>(label: string, task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.items.push({
        label,
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
      })
      this.pump()
    })
  }

  /** 等待队列清空（所有任务结束、无排队任务）。 */
  onIdle(): Promise<void> {
    if (!this.running && this.items.length === 0) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.idleWaiters.push(resolve)
    })
  }

  private pump(): void {
    if (this.running) return

    const item = this.items.shift()
    if (!item) {
      this.resolveIdle()
      return
    }

    this.running = true
    const startedAt = Date.now()
    this.startHook(item)

    void this.execute(item, startedAt).catch((error: unknown) => {
      // execute 内部已处理任务自身异常，这里只兜底，防止内部链产生 unhandledRejection
      console.error(`[task-queue] 任务 "${item.label}" 执行异常:`, error)
    })
  }

  private async execute(item: QueueItem, startedAt: number): Promise<void> {
    let value: unknown
    let failure: unknown
    let fulfilled = false

    try {
      // 用 await 包裹任务调用：同步抛错会被 catch 收敛，
      // 返回非 thenable 时 await 也会原样取值，不会因 .then 不存在而抛错。
      value = await item.task()
      fulfilled = true
    } catch (error) {
      failure = error
    }

    // 先完成清理（释放槽位、触发钩子、调度下一个），再结算调用方 Promise，
    // 保证 await run() 返回时队列状态已一致（isRunning / onFinish 均已更新）。
    this.running = false
    this.finishHook(item, startedAt, failure)
    this.pump()

    if (fulfilled) {
      item.resolve(value)
    } else {
      item.reject(failure)
    }
  }

  private resolveIdle(): void {
    if (this.running || this.items.length > 0) return
    const waiters = this.idleWaiters
    this.idleWaiters = []
    for (const resolve of waiters) resolve()
  }

  private startHook(item: QueueItem): void {
    try {
      this.hooks.onStart?.(item.label, this.items.length)
    } catch (error) {
      console.error(`[task-queue] onStart 回调异常（已忽略）:`, error)
    }
  }

  private finishHook(item: QueueItem, startedAt: number, error: unknown): void {
    try {
      this.hooks.onFinish?.(item.label, Date.now() - startedAt, error, this.items.length)
    } catch (hookError) {
      console.error(`[task-queue] onFinish 回调异常（已忽略）:`, hookError)
    }
  }
}
