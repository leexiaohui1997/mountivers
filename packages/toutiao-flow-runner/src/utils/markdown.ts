import { marked, type Tokens } from 'marked'

/**
 * 从 markdown 文本提取 json / jsonc 代码块并解析。
 * 基于 marked 解析 AST,正确跳过嵌套围栏、转义等边缘情况。
 */

const JSON_LANGS = new Set(['json', 'jsonc'])

/** 解析单个代码块文本:先严格 JSON.parse,失败再清洗注释/尾逗号。 */
function parseLoose(raw: string): unknown {
  const trimmed = raw.trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const cleaned = trimmed
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/,(\s*[}\]])/g, '$1')
    try {
      return JSON.parse(cleaned)
    } catch {
      throw new Error('JSON 代码块解析失败')
    }
  }
}

/** 提取所有 json/jsonc 代码块(返回解析后的对象数组,解析失败的块跳过)。 */
export function extractJsonBlocks(md: string): unknown[] {
  const tokens = marked.lexer(md)
  const blocks: unknown[] = []
  for (const token of tokens) {
    if (token.type === 'code') {
      const code = token as Tokens.Code
      if (JSON_LANGS.has((code.lang ?? '').toLowerCase())) {
        try {
          blocks.push(parseLoose(code.text))
        } catch {
          // 跳过无法解析的块
        }
      }
    }
  }
  return blocks
}

/** 提取第一个 json/jsonc 代码块(无则 null)。 */
export function extractJsonBlock(md: string): unknown | null {
  return extractJsonBlocks(md)[0] ?? null
}
