import { z } from 'zod'

import { attachToFile } from '../utils/attach.js'
import { extractJsonBlock } from '../utils/markdown.js'
import { renderToAttach } from '../utils/template.js'

import type { Ai } from '../ai/types.js'
import type { ArticleJson } from '../types/article.js'

export const QUALITY_MIN_OVERALL = 4
export const MAX_QUALITY_ATTEMPTS = 3

export interface QualityDimension {
  id: string
  name: string
  weight: number
  minScore: number
  description: string
}

/** 成稿质量评分维度；新增维度只需在这里注册并补充分数说明 */
export const ARTICLE_QUALITY_DIMENSIONS: readonly QualityDimension[] = [
  {
    id: 'title',
    name: '标题吸引力',
    weight: 1.5,
    minScore: 4,
    description: '是否有具体人群、冲突或反常识、明确收益，且不过度夸张。',
  },
  {
    id: 'hook',
    name: '开头钩子',
    weight: 1.5,
    minScore: 4,
    description: '前 3 段是否建立具体场景、痛点和继续阅读的理由。',
  },
  {
    id: 'specificity',
    name: '具体性',
    weight: 1.5,
    minScore: 4,
    description: '是否有具体案例、动作、对话、数字，而不是抽象说理。',
  },
  {
    id: 'emotionalResonance',
    name: '情绪共鸣',
    weight: 1.2,
    minScore: 3.5,
    description: '是否能引发被理解、警醒、释然或希望，情绪线是否完整。',
  },
  {
    id: 'insight',
    name: '信息增量',
    weight: 1.2,
    minScore: 3.5,
    description: '是否提供反常识解释或新视角，而不是常识堆砌。',
  },
  {
    id: 'readability',
    name: '阅读节奏',
    weight: 1,
    minScore: 3.5,
    description: '段落、小标题、金句是否适合手机快速阅读。',
  },
  {
    id: 'titleContentFit',
    name: '标题正文一致性',
    weight: 1.5,
    minScore: 4,
    description: '正文是否兑现标题承诺，是否存在标题党或前后不一致。',
  },
  {
    id: 'authorialPresence',
    name: '作者存在感',
    weight: 1.2,
    minScore: 3.5,
    description:
      '是否有稳定、可辨认的作者视角、判断和语气，而不是通用的 AI 说教；允许克制，但不能完全没有作者立场。',
  },
]

const DimensionScoreSchema = z.object({
  id: z.string(),
  score: z.number().min(1).max(5),
  reason: z.string().min(1),
  evidence: z.string().optional(),
  suggestion: z.string().optional(),
})

export const ArticleQualityCheckSchema = z.object({
  dimensions: z.array(DimensionScoreSchema),
  summary: z.string().optional(),
})

export type DimensionScore = z.infer<typeof DimensionScoreSchema>
export type ArticleQualityCheck = z.infer<typeof ArticleQualityCheckSchema>

export interface ScoredDimension extends DimensionScore, QualityDimension {
  passed: boolean
}

export interface ArticleQualityResult {
  overall: number
  passed: boolean
  dimensions: ScoredDimension[]
  failed: ScoredDimension[]
  summary?: string
}

function formatQualityIssues(dimensions: ScoredDimension[]): string {
  return dimensions
    .map(
      (dimension) =>
        `- ${dimension.name}：${dimension.score}/${dimension.minScore}。${dimension.reason}${
          dimension.evidence ? ` 证据：${dimension.evidence}` : ''
        }${dimension.suggestion ? ` 建议：${dimension.suggestion}` : ''}`,
    )
    .join('\n')
}

/** 用独立判定 AI 给成稿评分；判定失败时返回 null，由调用方 fail open。 */
export async function reviewArticleQuality(
  judgeAi: Ai | undefined,
  article: ArticleJson,
): Promise<ArticleQualityResult | null> {
  if (!judgeAi) return null

  try {
    const promptFile = await renderToAttach(
      'article-quality.prompt',
      { dimensions: ARTICLE_QUALITY_DIMENSIONS },
      '成稿质量评分提示词.md',
    )
    const dataFile = await attachToFile({
      type: 'markdown',
      filename: '待评分成稿.json',
      content: JSON.stringify(article, null, 2),
    })

    const answer = await judgeAi.text2text({
      prompt: '请按照附件《成稿质量评分提示词.md》给附件《待评分成稿.json》评分，只返回评分 JSON。',
      attaches: [promptFile, dataFile],
    })

    const json = extractJsonBlock(answer)
    if (!json) throw new Error('评分 AI 未返回 JSON 代码块')

    const parsed = ArticleQualityCheckSchema.safeParse(json)
    if (!parsed.success) {
      throw new Error(
        parsed.error.issues
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; '),
      )
    }

    const byId = new Map(parsed.data.dimensions.map((item) => [item.id, item]))
    const dimensions = ARTICLE_QUALITY_DIMENSIONS.map((config) => {
      const score = byId.get(config.id)
      if (!score) throw new Error(`评分结果缺少维度: ${config.id}`)
      return {
        ...config,
        ...score,
        passed: score.score >= config.minScore,
      }
    })

    const totalWeight = dimensions.reduce((sum, item) => sum + item.weight, 0)
    const overall =
      dimensions.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight
    const failed = dimensions.filter((item) => !item.passed)

    return {
      overall,
      passed: failed.length === 0 && overall >= QUALITY_MIN_OVERALL,
      dimensions,
      failed,
      summary: parsed.data.summary,
    }
  } catch (error) {
    console.error(
      `[article-quality] 评分失败，按通过处理: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return null
  }
}

/** 根据评分结果生成针对性重写提示 */
export function buildArticleQualityRepair(result: ArticleQualityResult): string {
  const dimensions = result.failed.length
    ? result.failed
    : [...result.dimensions].sort((a, b) => a.score - b.score).slice(0, 3)

  return [
    '本次成稿质量评分未达标。',
    `加权总分：${result.overall.toFixed(2)}，要求 ≥ ${QUALITY_MIN_OVERALL}。`,
    '未达标维度：',
    formatQualityIssues(dimensions),
    '',
    '请保留已通过硬性规则和评分的内容，只针对上述问题重写；',
    '不要只换同义词，要补充具体场景、动作、对话、案例或明确的方法。',
    '重新输出完整 article JSON（使用 json 代码块），不要只输出修改片段。',
  ].join('\n')
}
