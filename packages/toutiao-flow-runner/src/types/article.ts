import { z } from 'zod'

/** 正文段落 */
const TextBlockSchema = z.object({
  type: z.literal('text'),
  content: z.string().min(1),
})

/** 正文小标题 */
const TitleBlockSchema = z.object({
  type: z.literal('title'),
  content: z.string().min(1),
})

/** 插图：成稿阶段只有提示词，图片路径由生图角色回填到 content */
const ImageBlockSchema = z.object({
  type: z.literal('image'),
  prompt: z.string().min(1),
  /** 生成后的图片路径（绝对路径） */
  content: z.string().optional(),
})

export const ArticleBlockSchema = z.discriminatedUnion('type', [
  TextBlockSchema,
  TitleBlockSchema,
  ImageBlockSchema,
])

/** 单篇成稿 ArticleJson —— 对齐 article.prompt.md 的 schema */
export const ArticleJsonSchema = z.object({
  no: z.number().int(),
  title: z.string().min(1),
  altTitles: z.array(z.string()),
  coverPrompt: z.string().min(1),
  bilibiliCoverPrompt: z.string().min(1),
  /** 成稿封面路径（生图后回填） */
  cover: z.string().optional(),
  /** B站封面路径（生图后回填） */
  bilibiliCover: z.string().optional(),
  content: z.array(ArticleBlockSchema).min(1),
  goldenQuotes: z.array(z.string()),
  tags: z.array(z.string()),
  layoutNotes: z.string().optional(),
})

export type ArticleBlock = z.infer<typeof ArticleBlockSchema>
export type ImageBlock = z.infer<typeof ImageBlockSchema>
export type ArticleJson = z.infer<typeof ArticleJsonSchema>

/** 将 zod issues 格式化为可读的多行错误描述 */
export function formatArticleIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length ? issue.path.join('.') : '(root)'
      return `  - ${path}: ${issue.message}`
    })
    .join('\n')
}

/**
 * 类型守卫：判断任意值是否符合 ArticleJson 结构。
 * 失败时若传入 onError，回调收到可读的详细错误信息。
 */
export function isArticleJson(
  value: unknown,
  onError?: (detail: string) => void,
): value is ArticleJson {
  const result = ArticleJsonSchema.safeParse(value)
  if (!result.success) {
    onError?.(formatArticleIssues(result.error))
    return false
  }
  return true
}
