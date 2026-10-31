import { TaskQueue } from './task-queue.js'

/**
 * 浏览器任务队列：所有 Playwright 操作都必须经由此队列提交。
 *
 * 浏览器是进程级单例（共享登录态 / profile / 剪贴板），并行执行会互相
 * 抢键盘、剪贴板、filechooser 和标签页焦点，因此统一串行。
 *
 * 使用约定：一个任务 = 一次完整的页面生命周期
 * （getPage → 会话操作 → finally releasePage），不要把一段流程拆成多个任务，
 * 否则仍可能在步骤之间被其他流程插入。
 */
export const browserQueue = new TaskQueue({
  onStart: (label, pending) => {
    console.log(`[browser] ▶ ${label} 开始${pending ? `（排队 ${pending}）` : ''}`)
  },
  onFinish: (label, durationMs, error, pending) => {
    const status = error ? '✗' : '✓'
    const detail = error ? ` - ${error instanceof Error ? error.message : String(error)}` : ''
    console.log(
      `[browser] ${status} ${label} ${durationMs}ms${detail}${pending ? `（排队 ${pending}）` : ''}`,
    )
  },
})
