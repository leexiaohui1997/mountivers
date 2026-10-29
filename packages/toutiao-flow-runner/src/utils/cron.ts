import { CronExpressionParser, type CronExpressionOptions } from 'cron-parser'

/**
 * 校验 cron 表达式是否合法。
 */
export function isValidCron(expr: string): boolean {
  try {
    CronExpressionParser.parse(expr)
    return true
  } catch {
    return false
  }
}

/**
 * 计算 after(毫秒时间戳)之后的下一次触发时刻(毫秒时间戳)。
 * 是 cron-parser 的唯一接触面;调度器只依赖此纯函数。
 */
export function cronNext(expr: string, after: number): number {
  const options: CronExpressionOptions = { currentDate: new Date(after) }
  return CronExpressionParser.parse(expr, options).next().getTime()
}
