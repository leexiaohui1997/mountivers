import { isTopicKeywordsJson } from '../../types/topic-keywords.js'
import { extractJsonBlock } from '../../utils/markdown.js'
import { renderTemplate } from '../../utils/template.js'

import type { Ai } from '../types.js'

export interface GenerateTopicKeywordsOptions {
  sessionUrl?: string
  exclude?: string[]
}

/** 生成话题搜索关键词；JSON 不合法时持续纠正 */
export async function generateTopicKeywords(
  ai: Ai,
  opts: GenerateTopicKeywordsOptions = {},
): Promise<string[]> {
  let keywords: string[] | undefined

  await ai.text2text({
    prompt: await renderTemplate('topic-keywords.prompt', { exclude: opts.exclude ?? [] }),
    sessionUrl: opts.sessionUrl,
    onResult: async (answer, append) => {
      const json = extractJsonBlock(answer)
      if (!json) {
        await append({ prompt: '请以 json 代码块的格式回复' })
        return
      }

      let failReason = ''
      if (isTopicKeywordsJson(json, (reason) => (failReason = reason))) {
        keywords = json.keywords
        return
      }

      await append({ prompt: `json 格式错误，请调整：${failReason}` })
    },
  })

  if (!keywords) {
    throw new Error('话题关键词生成失败：AI 未返回合法 JSON')
  }

  return keywords
}
