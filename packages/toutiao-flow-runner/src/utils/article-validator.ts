import { countWords, WORD_THRESHOLD } from './word-count.js'

import type { ArticleBlock, ArticleJson } from '../types/article.js'

export type ArticleViolationCode =
  | 'WORD_COUNT'
  | 'TITLE_LENGTH'
  | 'IMAGE_COUNT'
  | 'IMAGE_ADJACENT'
  | 'COVER_RATIO'
  | 'COVER_TEXT'
  | 'BILIBILI_RATIO'
  | 'BILIBILI_TEXT'
  | 'ILLUSTRATION_RATIO'
  | 'TAG_COUNT'
  | 'QUOTE_STYLE'

export interface ArticleViolation {
  code: ArticleViolationCode
  message: string
}

export interface ArticleValidationResult {
  wordCount: number
  imageCount: number
  violations: ArticleViolation[]
}

/** 封面比例：兼容 x / × / 大写 X 与空格 */
const COVER_RATIO = /2054\s*[x×X]\s*1600/
/** 横版比例：兼容半角/全角冒号与空格 */
const WIDE_RATIO = /16\s*[:：]\s*9/

export const MAX_TITLE_LENGTH = 30
export const MIN_IMAGE_COUNT = 3
export const MAX_IMAGE_COUNT = 5
export const TAG_COUNT = 5

/** 按码点计长度，避免 emoji 等被算成多个字 */
function charLength(value: string): number {
  return Array.from(value).length
}

function isImageBlock(block: ArticleBlock): block is Extract<ArticleBlock, { type: 'image' }> {
  return block.type === 'image'
}

/** 参与引号校验的文本片段（不含封面/插图提示词与 layoutNotes） */
interface TextFragment {
  field: string
  text: string
}

function collectArticleText(article: ArticleJson): TextFragment[] {
  const fragments: TextFragment[] = [
    { field: '主标题', text: article.title },
    ...article.altTitles.map((text, index) => ({ field: `备选标题${index + 1}`, text })),
  ]

  article.content.forEach((block, index) => {
    if (block.type === 'text' || block.type === 'title') {
      fragments.push({ field: `第 ${index + 1} 个内容块`, text: block.content })
    }
  })

  article.goldenQuotes.forEach((text, index) => {
    fragments.push({ field: `金句${index + 1}`, text })
  })

  return fragments
}

function countChar(text: string, char: string): number {
  return Array.from(text).filter((item) => item === char).length
}

/** 中文引号规范：禁止英文直引号，中文双/单引号必须成对 */
function validateQuotes(article: ArticleJson, violations: ArticleViolation[]): void {
  const fragments = collectArticleText(article)

  const straightQuoteFields = fragments
    .filter((fragment) => /["']/.test(fragment.text))
    .map((fragment) => fragment.field)
  if (straightQuoteFields.length > 0) {
    violations.push({
      code: 'QUOTE_STYLE',
      message: `以下位置使用了英文直引号，请改用中文引号“”‘’：${straightQuoteFields.join('、')}。`,
    })
  }

  const allText = fragments.map((fragment) => fragment.text).join('')
  const openDouble = countChar(allText, '“')
  const closeDouble = countChar(allText, '”')
  const openSingle = countChar(allText, '‘')
  const closeSingle = countChar(allText, '’')

  if (openDouble !== closeDouble || openSingle !== closeSingle) {
    violations.push({
      code: 'QUOTE_STYLE',
      message: `中文引号未成对：双引号“ ${openDouble} 个 / ” ${closeDouble} 个；单引号‘ ${openSingle} 个 / ’ ${closeSingle} 个，请补齐或删除多余的引号。`,
    })
  }
}

/**
 * 成稿业务规则校验（结构由 zod 负责）。
 * 返回违规列表；空数组表示通过。
 */
export function validateArticle(article: ArticleJson): ArticleValidationResult {
  const violations: ArticleViolation[] = []

  const wordCount = countWords(article)
  if (wordCount < WORD_THRESHOLD) {
    const gap = WORD_THRESHOLD - wordCount
    violations.push({
      code: 'WORD_COUNT',
      message: `正文字数不足：当前 ${wordCount} 字，要求 ≥ ${WORD_THRESHOLD} 字（还差 ${gap} 字）。`,
    })
  }

  const titleLength = charLength(article.title)
  if (titleLength > MAX_TITLE_LENGTH) {
    violations.push({
      code: 'TITLE_LENGTH',
      message: `主标题 ${titleLength} 字，超过 ${MAX_TITLE_LENGTH} 字，请压缩标题。`,
    })
  }

  const imageBlocks = article.content.filter(isImageBlock)
  const imageCount = imageBlocks.length
  if (imageCount < MIN_IMAGE_COUNT || imageCount > MAX_IMAGE_COUNT) {
    violations.push({
      code: 'IMAGE_COUNT',
      message: `插图 ${imageCount} 张，要求 ${MIN_IMAGE_COUNT}~${MAX_IMAGE_COUNT} 张。`,
    })
  }

  for (let i = 1; i < article.content.length; i++) {
    if (article.content[i].type === 'image' && article.content[i - 1].type === 'image') {
      violations.push({
        code: 'IMAGE_ADJACENT',
        message: `第 ${i} 与第 ${i + 1} 个内容块连续为插图，请在两张插图之间至少插入一段正文。`,
      })
    }
  }

  if (!COVER_RATIO.test(article.coverPrompt)) {
    violations.push({
      code: 'COVER_RATIO',
      message: 'coverPrompt 缺少封面比例 2054x1600。',
    })
  }
  if (!article.coverPrompt.includes('大字') || !article.coverPrompt.includes('小字')) {
    violations.push({
      code: 'COVER_TEXT',
      message: 'coverPrompt 缺少画面文字要求：必须同时包含“大字”和“小字”。',
    })
  }

  if (!WIDE_RATIO.test(article.bilibiliCoverPrompt)) {
    violations.push({
      code: 'BILIBILI_RATIO',
      message: 'bilibiliCoverPrompt 缺少横版比例 16:9。',
    })
  }
  if (
    !article.bilibiliCoverPrompt.includes('大字') ||
    !article.bilibiliCoverPrompt.includes('小字')
  ) {
    violations.push({
      code: 'BILIBILI_TEXT',
      message: 'bilibiliCoverPrompt 缺少画面文字要求：必须同时包含“大字”和“小字”。',
    })
  }

  imageBlocks.forEach((block, index) => {
    if (!WIDE_RATIO.test(block.prompt)) {
      violations.push({
        code: 'ILLUSTRATION_RATIO',
        message: `第 ${index + 1} 张插图的 prompt 缺少比例 16:9。`,
      })
    }
  })

  if (article.tags.length !== TAG_COUNT) {
    violations.push({
      code: 'TAG_COUNT',
      message: `tags 当前 ${article.tags.length} 个，要求恰好 ${TAG_COUNT} 个关键词。`,
    })
  } else if (article.tags.some((tag) => tag.trim().length === 0)) {
    violations.push({
      code: 'TAG_COUNT',
      message: `tags 中存在空关键词，请给出 ${TAG_COUNT} 个非空关键词。`,
    })
  }

  validateQuotes(article, violations)

  return { wordCount, imageCount, violations }
}

/** 编号化输出，便于直接拼入修复提示词与日志 */
export function formatViolations(violations: ArticleViolation[]): string {
  return violations.map((violation, index) => `${index + 1}. ${violation.message}`).join('\n')
}
