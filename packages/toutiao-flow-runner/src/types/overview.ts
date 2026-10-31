import { z } from 'zod'

/** 头条合集名称的最小长度 */
export const MIN_COLLECTION_NAME_LENGTH = 5

/** 合集名（含候选）：去空格后不少于 5 个字 */
const CollectionNameSchema = z
  .string()
  .refine((value) => Array.from(value.trim()).length >= MIN_COLLECTION_NAME_LENGTH, {
    message: `合集名称不少于 ${MIN_COLLECTION_NAME_LENGTH} 个字`,
  })

/** 单章概览 */
const ChapterSchema = z.object({
  index: z.number(),
  title: z.string(),
  topics: z.array(z.string()),
  summary: z.string(),
})

/** 成稿规划单篇 */
const ArticlePlanSchema = z.object({
  no: z.number(),
  topic: z.string(),
  sourceChapters: z.array(z.number()),
})

/** 全书概览 OverviewJson —— 对齐 overview.prompt.md 的 schema 与 1.md 实际字段 */
export const OverviewJsonSchema = z.object({
  bookTitle: z.string(),
  theme: z.string(),
  chapters: z.array(ChapterSchema),

  collectionNameCandidates: z.array(CollectionNameSchema),
  collectionName: CollectionNameSchema,
  collectionDesc: z.string(),

  collectionCoverPrompt: z.string(),
  xhsCollectionCoverPrompt: z.string(),

  articlePlan: z.array(ArticlePlanSchema),

  coverPromptTemplate: z.string(),
  illustrationPromptTemplate: z.string(),

  genre: z.string(),
  headlineTemplates: z.array(z.string()),
  structureAnalysis: z.string(),
})

export type OverviewJson = z.infer<typeof OverviewJsonSchema>

/** 将 zod issues 格式化为可读的多行错误描述 */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : '(root)'
      return `  - ${path}: ${issue.message}`
    })
    .join('\n')
}

/**
 * 解析并校验 OverviewJson。失败抛出含详细原因的错误。
 */
export function parseOverviewJson(s: unknown): OverviewJson {
  const result = OverviewJsonSchema.safeParse(s)
  if (!result.success) {
    throw new Error(`OverviewJson 校验失败:\n${formatIssues(result.error)}`)
  }
  return result.data
}

/**
 * 类型守卫:判断任意值是否符合 OverviewJson 结构。
 * 失败时若传入 onError,回调收到可读的详细错误信息(便于日志/调试)。
 */
export function isOverviewJson(s: unknown, onError?: (detail: string) => void): s is OverviewJson {
  const result = OverviewJsonSchema.safeParse(s)
  if (!result.success) {
    onError?.(formatIssues(result.error))
    return false
  }
  return true
}
