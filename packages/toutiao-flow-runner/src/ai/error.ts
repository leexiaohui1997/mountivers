/** AI 额度或会员限制命中；调用方应切换引擎或暂停相关任务 */
export class CreditLimitError extends Error {
  constructor(
    message = 'AI 额度或会员限制',
    /** 建议等待多久后重试；优先使用此值，而不是调用方的固定默认值 */
    public readonly retryAfterMs?: number,
  ) {
    super(message)
    this.name = 'CreditLimitError'
  }
}
