import { isCheckJson, type CheckJson } from '../../types/check.js'
import { extractJsonBlock } from '../../utils/markdown.js'
import { renderTemplate } from '../../utils/template.js'

import type { Ai } from '../types.js'

export interface CheckImageOptions {
  image: File
  /** 原始生图提示词，用于校验画面是否符合要求 */
  prompt: string
}

/** 图片质量校验；JSON 不合法时沿用上一轮结论重新输出 */
export async function checkImage(ai: Ai, opts: CheckImageOptions): Promise<CheckJson> {
  let result: CheckJson | undefined

  await ai.text2text({
    prompt: await renderTemplate('image-check.prompt', { prompt: opts.prompt }),
    attaches: [opts.image],
    onResult: async (answer, append) => {
      const json = extractJsonBlock(answer)
      if (!json) {
        await append({
          prompt:
            '针对上一轮图片质量检查的回复：回复里没有找到可解析的 JSON 代码块。请沿用上一轮已经完成的检查结论进行调整，只重新输出一个完整的 JSON 代码块，不要重复检查图片、不要输出解释或其他文字。',
        })
        return
      }

      let failReason = ''
      if (isCheckJson(json, (reason) => (failReason = reason))) {
        result = json
        return
      }

      await append({
        prompt: `针对上一轮图片质量检查的回复：JSON 格式不符合要求。请沿用上一轮已经完成的检查结论，修正以下问题后重新输出：\n${failReason}\n只输出一个完整的 JSON 代码块，不要重复检查图片、不要输出解释或其他文字。`,
      })
    },
  })

  if (!result) {
    throw new Error('图片质量校验失败：AI 未返回合法 check.json')
  }

  return result
}
