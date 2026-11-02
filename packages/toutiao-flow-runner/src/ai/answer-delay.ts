/** 特定场景读取回答前让出队列的时长 */
export const ANSWER_DELAY_MS = {
  overview: 60_000,
  article: 60_000,
  removeWatermark: 30_000,
} as const
