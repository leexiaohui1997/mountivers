/** AI 额度或会员限制命中；调用方应切换引擎或暂停相关任务 */
export class CreditLimitError extends Error {
  constructor(message = 'AI 额度或会员限制') {
    super(message)
    this.name = 'CreditLimitError'
  }
}
