import { TaskQueue } from './task-queue.js'

/**
 * 调起浏览器任务前的收集窗口（毫秒）。
 *
 * 角色调度器约每秒触发一轮，同一轮内各角色几乎同时提交浏览器任务。
 * 先等一小段时间让这些任务进入队列，再按角色优先级取最高者执行，
 * 避免低优先级任务抢在发布等高优先级流程之前占用浏览器。
 */
const COLLECT_WINDOW_MS = 300

/**
 * 浏览器任务队列：所有 Playwright 操作都必须经由此队列提交。
 *
 * 浏览器是进程级单例（共享登录态 / profile / 剪贴板），并行执行会互相
 * 抢键盘、剪贴板、filechooser 和标签页焦点，因此统一串行。
 *
 * 使用约定：一个任务 = 一次完整的页面生命周期
 * （getPage → 会话操作 → finally releasePage），不要把一段流程拆成多个任务，
 * 否则仍可能在步骤之间被其他流程插入。
 *
 * 优先级透传：角色调用 run() 时传入自身 priority（数字越大越先），
 * 队列会在收集窗口结束后按优先级出队。
 */
export const browserQueue = new TaskQueue(
  {
    onStart: (label, pending, priority) => {
      console.log(
        `[browser] ▶ ${label} 开始${pending ? `（排队 ${pending}）` : ''}${priority ? `（优先级 ${priority}）` : ''}`,
      )
    },
    onFinish: (label, durationMs, error, pending) => {
      const status = error ? '✗' : '✓'
      const detail = error ? ` - ${error instanceof Error ? error.message : String(error)}` : ''
      console.log(
        `[browser] ${status} ${label} ${durationMs}ms${detail}${pending ? `（排队 ${pending}）` : ''}`,
      )
    },
  },
  { collectWindowMs: COLLECT_WINDOW_MS },
)
