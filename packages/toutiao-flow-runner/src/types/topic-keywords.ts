import { z } from 'zod'

/** 话题搜索关键词提炼结果 —— 对齐 templates/topic-keywords.prompt.md 的 schema */
export const TopicKeywordsJsonSchema = z.object({
  keywords: z.array(z.string().min(1)),
})

export type TopicKeywordsJson = z.infer<typeof TopicKeywordsJsonSchema>

/** 类型守卫:判断任意值是否符合 TopicKeywordsJson 结构;失败时可通过 onError 拿到详细原因 */
export function isTopicKeywordsJson(
  s: unknown,
  onError?: (detail: string) => void,
): s is TopicKeywordsJson {
  const result = TopicKeywordsJsonSchema.safeParse(s)
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
