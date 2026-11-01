import { z } from 'zod'

export const JsonContentIssueSchema = z.object({
  /** JSON 字段路径，例如 bookTitle / content[2].content */
  path: z.string(),
  /** 不可用的具体原因 */
  reason: z.string(),
})

export const JsonContentCheckSchema = z.object({
  pass: z.boolean(),
  issues: z.array(JsonContentIssueSchema),
})

export type JsonContentIssue = z.infer<typeof JsonContentIssueSchema>
export type JsonContentCheck = z.infer<typeof JsonContentCheckSchema>

export function isJsonContentCheck(
  value: unknown,
  onError?: (detail: string) => void,
): value is JsonContentCheck {
  const result = JsonContentCheckSchema.safeParse(value)
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
