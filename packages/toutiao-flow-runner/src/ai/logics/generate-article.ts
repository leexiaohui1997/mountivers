import { isArticleJson, type ArticleJson } from '../../types/article.js'
import { validateArticle } from '../../utils/article-validator.js'
import { attachToFile } from '../../utils/attach.js'
import { extractJsonBlock } from '../../utils/markdown.js'
import { renderToAttach, renderTemplate } from '../../utils/template.js'
import { WORD_THRESHOLD } from '../../utils/word-count.js'

import type { OverviewJson } from '../../types/overview.js'
import type { Ai } from '../types.js'

export interface ArticleViolationInfo {
  violations: string[]
  wordCount: number
  imageCount: number
  needExpand: boolean
  jsonQuoteHint: boolean
}

export interface GenerateArticleOptions {
  bookPath: string
  overview: OverviewJson
  index: number
  sessionUrl?: string
  /** 每次校验失败时回调，通常用于落库 attempts / lastError */
  onViolation?: (info: ArticleViolationInfo) => Promise<void>
}

export interface GenerateArticleResult {
  data: ArticleJson
  sessionUrl: string
}

/** 生成单篇成稿；结构/字数/图片/标签等不通过时无限次追加修复提示 */
export async function generateArticle(
  ai: Ai,
  opts: GenerateArticleOptions,
): Promise<GenerateArticleResult> {
  const bookFile = await attachToFile({ type: 'file', path: opts.bookPath })
  const overviewFile = await attachToFile({
    type: 'markdown',
    filename: 'overview.json',
    content: JSON.stringify(opts.overview, null, 2),
  })
  const promptFile = await renderToAttach('article.prompt', '成稿编写提示词.md')

  let data: ArticleJson | undefined

  await ai.text2text({
    prompt: `按提示词为第${opts.index}篇撰写成稿 article，以 json 代码块的格式回复`,
    attaches: [bookFile, overviewFile, promptFile],
    sessionUrl: opts.sessionUrl,
    onResult: async (answer, append) => {
      const appendRepair = async (info: ArticleViolationInfo): Promise<void> => {
        await opts.onViolation?.(info)

        const repair = await renderTemplate('article-repair.prompt', {
          violations: info.violations,
          needExpand: info.needExpand,
          wordCount: info.wordCount,
          threshold: WORD_THRESHOLD,
          gap: Math.max(0, WORD_THRESHOLD - info.wordCount),
          jsonQuoteHint: info.jsonQuoteHint,
        })
        await append({ prompt: repair })
      }

      const json = extractJsonBlock(answer)
      if (!json) {
        await appendRepair({
          violations: ['AI 回复中没有找到 json 代码块。'],
          wordCount: 0,
          imageCount: 0,
          needExpand: false,
          jsonQuoteHint: true,
        })
        return
      }

      let detail = ''
      if (!isArticleJson(json, (reason) => (detail = reason))) {
        await appendRepair({
          violations: [`article JSON 结构不符合 schema：\n${detail}`],
          wordCount: 0,
          imageCount: 0,
          needExpand: false,
          jsonQuoteHint: true,
        })
        return
      }

      // no 以数据库篇号为准，避免模型写错导致无意义重试
      const articleJson: ArticleJson = { ...json, no: opts.index }
      const { violations, wordCount, imageCount } = validateArticle(articleJson)

      if (violations.length === 0) {
        data = articleJson
        return
      }

      await appendRepair({
        violations: violations.map((violation) => violation.message),
        wordCount,
        imageCount,
        needExpand: wordCount < WORD_THRESHOLD,
        jsonQuoteHint: false,
      })
    },
  })

  if (!data) {
    throw new Error('成稿生成失败：AI 未返回合法的 article JSON')
  }

  return { data, sessionUrl: ai.getSessionUrl() }
}
