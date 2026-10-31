import { z } from 'zod'

export const MICRO_HEADLINE_MIN_CONTENT = 200
export const MICRO_HEADLINE_MAX_CONTENT = 600

export const MicroHeadlineImageSchema = z.object({
  prompt: z.string().min(1),
  /** 图片落盘路径；只由生图角色回填，AI 不应返回 */
  path: z.string().optional(),
})

export const MicroHeadlineSchema = z.object({
  content: z.string().min(1),
  images: z.array(MicroHeadlineImageSchema).length(3),
  topic: z.string().min(1),
})

export type MicroHeadlineImage = z.infer<typeof MicroHeadlineImageSchema>
export type MicroHeadlineData = z.infer<typeof MicroHeadlineSchema>

/** 微头条正文字数：去空白后按码点计算 */
export function countMicroHeadlineContent(content: string): number {
  return Array.from(content.replace(/\s/g, '')).length
}

export function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase()
}

/** 业务校验：字数、3 张图、16:9、话题去重 */
export function validateMicroHeadline(
  data: MicroHeadlineData,
  excludeTopics: string[] = [],
): string[] {
  const violations: string[] = []
  const length = countMicroHeadlineContent(data.content)

  if (length <= MICRO_HEADLINE_MIN_CONTENT || length >= MICRO_HEADLINE_MAX_CONTENT) {
    violations.push(
      `正文字数需大于 ${MICRO_HEADLINE_MIN_CONTENT} 且小于 ${MICRO_HEADLINE_MAX_CONTENT}，当前 ${length}`,
    )
  }

  data.images.forEach((image, index) => {
    if (!/16\s*[:：]\s*9/.test(image.prompt)) {
      violations.push(`第 ${index + 1} 张配图提示词缺少 16:9 比例`)
    }
  })

  const normalized = normalizeTopic(data.topic)
  if (excludeTopics.some((topic) => normalizeTopic(topic) === normalized)) {
    violations.push(`话题「${data.topic}」已存在，请换一个话题`)
  }

  return violations
}

/** 类型守卫：判断任意值是否为微头条 schema */
export function isMicroHeadlineData(
  value: unknown,
  onError?: (detail: string) => void,
): value is MicroHeadlineData {
  const result = MicroHeadlineSchema.safeParse(value)
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
