import { z } from 'zod'

/** 图片质量校验结果 —— 对齐 templates/image-check.prompt.md 的 schema */
export const CheckJsonSchema = z.object({
  /** 整体是否合格:所有检查项全部通过才为 true */
  pass: z.boolean(),
  /** 0~100 综合评分；用于失败时挑选最佳结果，即使合格也必须给出 */
  score: z.number().min(0).max(100),
  /** 逐项检查结果,与模板 6 个校验维度一一对应 */
  checks: z.array(
    z.object({
      name: z.string(),
      pass: z.boolean(),
      /** 不通过的具体原因；通过时可为空，也可写一条非阻塞的改进建议 */
      reason: z.string(),
    }),
  ),
  /** 调整后的完整生图提示词，可直接用于重新出图；整体合格时为空字符串 */
  suggestion: z.string(),
})

export type CheckJson = z.infer<typeof CheckJsonSchema>

/** 类型守卫:判断任意值是否符合 CheckJson 结构;失败时可通过 onError 拿到详细原因 */
export function isCheckJson(s: unknown, onError?: (detail: string) => void): s is CheckJson {
  const result = CheckJsonSchema.safeParse(s)
  if (!result.success) {
    const detail = result.error.issues
      .map((issue) => {
        const path = issue.path.length ? issue.path.join('.') : '(root)'
        return `  - ${path}: ${issue.message}`
      })
      .join('\n')
    onError?.(detail)
    return false
  }
  return true
}
