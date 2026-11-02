import { AsyncLocalStorage } from 'node:async_hooks'

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
 *
 * 调度策略：
 * - 优先级：数字越大越先执行；同优先级保持提交顺序（FIFO）。
 * - 收集窗口：每次调起任务前先等待一段可配置的时间，窗口内到达的任务
 *   一起按优先级排序，避免先提交的低优先级任务立刻抢走槽位。
 *
 * 协作式暂停：
 * - 任务内调用 `await queue.suspend(ms)` 可主动让出当前队列槽位；
 * - 等待期间队列继续执行其他任务；
 * - 到期后的 lock 会插到队首，等当前任务结束后立即恢复原任务。
 */

/** 队列生命周期回调，用于日志、埋点或测试。回调抛错不会影响队列推进。 */
export interface TaskQueueHooks {
  /** 任务出队、即将执行。pending 为仍在排队的任务数（不含当前任务）。 */
  onStart?: (label: string, pending: number, priority: number) => void
  /** 任务结束（成功或失败都会触发）。error 为失败原因，成功时为 undefined。 */
  onFinish?: (label: string, durationMs: number, error: unknown, pending: number) => void
}

export interface TaskQueueOptions {
  /**
   * 调起任务前的收集窗口（毫秒）。窗口内提交的任务会一起按优先级排序，
   * 让同一时段（如同一次调度 tick）触发的任务能参与比较。
   * 默认 0，表示不额外等待。
   */
  collectWindowMs?: number
  /** 是否启用队列；关闭后 run() 直接执行任务，suspend() 仅等待指定时长 */
  enabled?: boolean
}

interface QueueItem {
  label: string
  /** 调度优先级，数字越大越先执行 */
  priority: number
  task: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

interface TaskContext {
  queue: TaskQueue
  item: QueueItem
  holdCount: number
  suspended: SuspendQueueItem | null
  suspendPromise: Promise<void> | null
}

interface SuspendQueueItem {
  item: QueueItem
  resolve: () => void
  reject: (reason?: unknown) => void
  timer?: ReturnType<typeof setTimeout>
  /** 是否真的让给了其他普通任务执行 */
  yielded: boolean
  /** 恢复任务前执行；用于重新激活页面等恢复动作 */
  beforeResume?: () => Promise<void>
  /** 所属任务的异步上下文 */
  context: TaskContext
}

type QueueEntry = { kind: 'task'; item: QueueItem } | { kind: 'lock'; suspended: SuspendQueueItem }

export class TaskQueue {
  private readonly entries: QueueEntry[] = []
  /** 当前处于暂停状态的任务 */
  private readonly suspendedItems = new Set<SuspendQueueItem>()
  /** 无等待时长的暂停任务：等下一个任务真正启动后，再进入 entries 队首 */
  private readonly pendingImmediateLocks: SuspendQueueItem[] = []
  private readonly taskContext = new AsyncLocalStorage<TaskContext>()
  private readonly hooks: TaskQueueHooks
  private readonly collectWindowMs: number
  private enabledFlag: boolean
  private running = false
  private collectTimer: ReturnType<typeof setTimeout> | null = null
  private idleWaiters: Array<() => void> = []
  private currentItem: QueueItem | null = null
  /** 已开始但尚未结束的任务数，包含暂停中的任务 */
  private activeTasks = 0

  constructor(hooks: TaskQueueHooks = {}, options: TaskQueueOptions = {}) {
    this.hooks = hooks
    this.collectWindowMs = Math.max(0, options.collectWindowMs ?? 0)
    this.enabledFlag = options.enabled ?? true
  }

  /** 是否启用队列；关闭后 run() 直接执行，不再排队 */
  get enabled(): boolean {
    return this.enabledFlag
  }

  set enabled(value: boolean) {
    if (this.enabledFlag === value) return
    this.enabledFlag = value
    if (value) this.pump()
  }

  /** 仍在排队、尚未开始的任务数（不含当前任务和暂停任务）。 */
  get size(): number {
    return this.enabledFlag ? this.entries.length + this.pendingImmediateLocks.length : 0
  }

  /** 当前是否有任务正在执行。 */
  get isRunning(): boolean {
    return this.enabledFlag && this.running
  }

  /**
   * 提交一个任务，返回该任务自身的结果。
   * 任务按优先级（数字越大越先）串行执行，同优先级按提交顺序；
   * 前一个结束（成功或失败）后才开始下一个。
   */
  run<T>(label: string, task: () => Promise<T>, priority = 0): Promise<T> {
    if (!this.enabledFlag) {
      return (async () => task())()
    }

    return new Promise<T>((resolve, reject) => {
      this.enqueue({
        label,
        priority,
        task,
        resolve: resolve as (value: unknown) => void,
        reject,
      })
      this.pump()
    })
  }

  /**
   * 暂停当前任务并让出队列。
   *
   * - 不传等待时长：等下一个任务启动后，把 lock 插入队首；
   * - 传入等待时长：等待期间队列继续执行其他任务，时间到后插入队首；
   * - lock 只有在当前任务结束后才会执行。
   *
   * 返回的 Promise 在任务重新获得队列执行权时 resolve。
   */
  suspend(waitTime = 0, beforeResume?: () => Promise<void>): Promise<void> {
    const waitMs = Math.max(0, waitTime)

    // 队列关闭时没有当前任务，只保留等待语义
    if (!this.enabledFlag) {
      return new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          Promise.resolve(beforeResume?.()).then(resolve, reject)
        }, waitMs)
      })
    }

    if (!this.running || !this.currentItem) {
      throw new Error('suspend() 只能在队列任务执行中调用')
    }

    const context = this.taskContext.getStore()
    if (!context || context.queue !== this || context.item !== this.currentItem) {
      throw new Error('suspend() 只能在队列任务执行中调用')
    }

    // 验证等独占操作期间不允许真正让出队列
    if (context.holdCount > 0) {
      return Promise.resolve()
    }

    const item = this.currentItem

    const suspended: SuspendQueueItem = {
      item,
      resolve: () => undefined,
      reject: () => undefined,
      yielded: false,
      beforeResume,
      context,
    }
    this.suspendedItems.add(suspended)

    const waitPromise = new Promise<void>((resolve, reject) => {
      suspended.resolve = resolve
      suspended.reject = reject
    })
    context.suspended = suspended
    context.suspendPromise = waitPromise

    this.currentItem = null
    this.running = false

    if (waitMs > 0) {
      suspended.timer = setTimeout(() => {
        this.enqueueLock(suspended)
      }, waitMs)
    } else {
      this.pendingImmediateLocks.push(suspended)
    }

    this.pump()

    // 没有下一个任务可启动时，无等待时长的暂停应立即恢复
    if (waitMs === 0 && !this.running && !this.collectTimer) {
      this.flushPendingLocks()
      this.pump()
    }

    return waitPromise
  }

  /**
   * 在当前任务内申请独占 hold。
   * hold 期间 suspend() 不会真正让出队列；如果任务已经 suspended，
   * 会取消当前 suspend 并把任务重新恢复为 running。
   */
  async hold(): Promise<() => void> {
    const context = this.taskContext.getStore()
    if (!context || context.queue !== this) {
      throw new Error('hold() 只能在队列任务执行中调用')
    }

    context.holdCount++

    if (context.suspended) {
      const suspended = context.suspended
      const waitPromise = context.suspendPromise

      // 已经在恢复流程中时不要重复插入 lock
      if (!(this.running && this.currentItem === suspended.item)) {
        this.promoteSuspended(suspended)
      }

      try {
        await waitPromise
      } catch (error) {
        context.holdCount--
        throw error
      }
    }

    let released = false
    return () => {
      if (released) return
      released = true
      context.holdCount--
    }
  }

  /** 等待队列清空（所有任务结束、无排队任务）。 */
  onIdle(): Promise<void> {
    if (!this.enabledFlag) return Promise.resolve()

    if (
      !this.running &&
      this.entries.length === 0 &&
      this.pendingImmediateLocks.length === 0 &&
      this.activeTasks === 0
    ) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve) => {
      this.idleWaiters.push(resolve)
    })
  }

  /** 取消挂起计时/排队，把暂停任务优先恢复 */
  private promoteSuspended(suspended: SuspendQueueItem): void {
    if (suspended.timer) {
      clearTimeout(suspended.timer)
      suspended.timer = undefined
    }

    for (let i = this.pendingImmediateLocks.length - 1; i >= 0; i--) {
      if (this.pendingImmediateLocks[i] === suspended) {
        this.pendingImmediateLocks.splice(i, 1)
      }
    }

    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]
      if (entry.kind === 'lock' && entry.suspended === suspended) {
        this.entries.splice(i, 1)
      }
    }

    if (this.collectTimer) {
      clearTimeout(this.collectTimer)
      this.collectTimer = null
    }

    this.entries.unshift({ kind: 'lock', suspended })
    this.pump()
  }

  /** 按优先级插入普通任务；同优先级保持提交顺序（FIFO）。 */
  private enqueue(item: QueueItem): void {
    const index = this.entries.findIndex(
      (entry) => entry.kind === 'task' && entry.item.priority < item.priority,
    )

    const taskEntry: QueueEntry = { kind: 'task', item }
    if (index === -1) {
      this.entries.push(taskEntry)
    } else {
      this.entries.splice(index, 0, taskEntry)
    }
  }

  /** 把一个暂存任务恢复项插入队首 */
  private enqueueLock(suspended: SuspendQueueItem): void {
    this.entries.unshift({ kind: 'lock', suspended })
    this.pump()
  }

  /** 无等待时长的恢复项：等下一个任务启动后再插入队首 */
  private flushPendingLocks(): void {
    while (this.pendingImmediateLocks.length > 0) {
      const suspended = this.pendingImmediateLocks.shift()!
      this.entries.unshift({ kind: 'lock', suspended })
    }
  }

  private pump(): void {
    if (this.running || this.collectTimer) return

    // 没有普通任务但已有可恢复任务时，直接恢复
    if (this.entries.length === 0) {
      this.flushPendingLocks()
      if (this.entries.length > 0) {
        this.dispatch()
        return
      }
      this.resolveIdle()
      return
    }

    // lock 在队首时不需要等待收集窗口
    if (this.entries[0].kind === 'lock') {
      this.dispatch()
      return
    }

    // 无收集窗口时立即调起，保持原有的即时执行语义
    if (this.collectWindowMs === 0) {
      this.dispatch()
      return
    }

    // 预留收集窗口：等同一时段的任务到齐后，再按优先级取最高者
    this.collectTimer = setTimeout(() => {
      this.collectTimer = null
      this.dispatch()
    }, this.collectWindowMs)
  }

  /** 取出当前优先级最高的任务，或执行队首 lock。 */
  private dispatch(): void {
    if (this.running) return

    const entry = this.entries.shift()
    if (!entry) {
      this.flushPendingLocks()
      if (this.entries.length > 0) {
        this.dispatch()
        return
      }
      this.resolveIdle()
      return
    }

    if (entry.kind === 'lock') {
      const suspended = entry.suspended
      this.suspendedItems.delete(suspended)
      this.running = true
      this.currentItem = suspended.item

      const resume = () => {
        suspended.context.suspended = null
        suspended.context.suspendPromise = null

        if (suspended.yielded) {
          console.log(`[task-queue] 恢复 "${suspended.item.label}"`)
        }

        suspended.resolve()
        this.flushPendingLocks()
      }

      if (suspended.beforeResume) {
        void suspended.beforeResume().then(resume, (error: unknown) => {
          suspended.context.suspended = null
          suspended.context.suspendPromise = null
          suspended.reject(error)
        })
        return
      }

      resume()
      return
    }

    const item = entry.item
    this.running = true
    this.currentItem = item
    this.activeTasks++

    const startedAt = Date.now()
    this.startHook(item)
    this.logSuspensionsYielded(item.label)

    // 下一个任务已经启动，此时才允许无等待时长的暂停任务进入恢复队列
    this.flushPendingLocks()

    void this.execute(item, startedAt).catch((error: unknown) => {
      // execute 内部已处理任务自身异常，这里只兜底，防止内部链产生 unhandledRejection
      console.error(`[task-queue] 任务 "${item.label}" 执行异常:`, error)
    })
  }

  /** 只有其他任务真正开始执行时，才记录一次挂起日志 */
  private logSuspensionsYielded(nextLabel: string): void {
    for (const suspended of this.suspendedItems) {
      if (suspended.yielded) continue
      suspended.yielded = true
      console.log(`[task-queue] 挂起 "${suspended.item.label}"（让出给 "${nextLabel}"）`)
    }
  }

  private async execute(item: QueueItem, startedAt: number): Promise<void> {
    let value: unknown
    let failure: unknown
    let fulfilled = false
    const context: TaskContext = {
      queue: this,
      item,
      holdCount: 0,
      suspended: null,
      suspendPromise: null,
    }

    try {
      // 用 await 包裹任务调用：同步抛错会被 catch 收敛，
      // 返回非 thenable 时 await 也会原样取值，不会因 .then 不存在而抛错。
      value = await this.taskContext.run(context, () => item.task())
      fulfilled = true
    } catch (error) {
      failure = error
    }

    // 先完成清理（释放槽位、触发钩子、调度下一个），再结算调用方 Promise，
    // 保证 await run() 返回时队列状态已一致（isRunning / onFinish 均已更新）。
    this.running = false
    this.currentItem = null
    this.activeTasks--
    this.finishHook(item, startedAt, failure)
    this.pump()

    if (fulfilled) {
      item.resolve(value)
    } else {
      item.reject(failure)
    }
  }

  private resolveIdle(): void {
    if (
      this.running ||
      this.entries.length > 0 ||
      this.pendingImmediateLocks.length > 0 ||
      this.activeTasks > 0
    ) {
      return
    }

    const waiters = this.idleWaiters
    this.idleWaiters = []
    for (const resolve of waiters) resolve()
  }

  private startHook(item: QueueItem): void {
    try {
      this.hooks.onStart?.(item.label, this.entries.length, item.priority)
    } catch (error) {
      console.error(`[task-queue] onStart 回调异常（已忽略）:`, error)
    }
  }

  private finishHook(item: QueueItem, startedAt: number, error: unknown): void {
    try {
      this.hooks.onFinish?.(item.label, Date.now() - startedAt, error, this.entries.length)
    } catch (hookError) {
      console.error(`[task-queue] onFinish 回调异常（已忽略）:`, hookError)
    }
  }
}
