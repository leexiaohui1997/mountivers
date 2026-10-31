/** 正文字数硬门槛 */
export const WORD_THRESHOLD = 3500

/** 参与字数统计的正文块（只需关心 type / content） */
export interface WordCountBlock {
  type?: string
  content?: string
}

/**
 * 统计 article.content 中的正文字数：text + title，去除空白后按字符长度累加。
 * 与老项目 src/commands/count-words.ts 的 countWords 保持同一口径。
 */
export function countWords(data: { content?: WordCountBlock[] }): number {
  let total = 0
  for (const block of data.content ?? []) {
    if (block.type === 'text' || block.type === 'title') {
      total += (block.content || '').replace(/\s/g, '').length
    }
  }
  return total
}
