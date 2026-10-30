import { z } from 'zod'

/** 违规提示词改写结果 —— 对齐 templates/fix-prompt.prompt.md 的 schema */
export const FixPromptJsonSchema = z.object({
  /** 改写后的完整提示词文本 */
  prompt: z.string().min(1),
})

export type FixPromptJson = z.infer<typeof FixPromptJsonSchema>

/** 类型守卫:判断任意值是否符合 FixPromptJson 结构;失败时可通过 onError 拿到详细原因 */
export function isFixPromptJson(
  s: unknown,
  onError?: (detail: string) => void,
): s is FixPromptJson {
  const result = FixPromptJsonSchema.safeParse(s)
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
