import { isFixPromptJson } from '../../types/fix-prompt.js'
import { extractJsonBlock } from '../../utils/markdown.js'
import { renderTemplate } from '../../utils/template.js'

import type { Ai } from '../types.js'

export interface FixImagePromptOptions {
  prompt: string
  sessionUrl?: string
}

/** 改写违规的图片提示词；格式不合法时持续纠正 */
export async function fixImagePrompt(ai: Ai, opts: FixImagePromptOptions): Promise<string> {
  let fixedPrompt: string | undefined

  await ai.text2text({
    prompt: await renderTemplate('fix-prompt.prompt', { prompt: opts.prompt }),
    sessionUrl: opts.sessionUrl,
    onResult: async (answer, append) => {
      const json = extractJsonBlock(answer)
      if (!json) {
        await append({ prompt: '请以 json 代码块的格式回复' })
        return
      }

      let failReason = ''
      if (isFixPromptJson(json, (reason) => (failReason = reason))) {
        fixedPrompt = json.prompt
        return
      }

      await append({ prompt: `json 格式错误，请调整：${failReason}` })
    },
  })

  if (!fixedPrompt) {
    throw new Error('提示词改写失败：AI 未返回合法 JSON')
  }

  return fixedPrompt
}
