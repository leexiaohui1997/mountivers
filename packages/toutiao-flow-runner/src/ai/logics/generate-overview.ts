import { isOverviewJson, type OverviewJson } from '../../types/overview.js'
import { attachToFile } from '../../utils/attach.js'
import { extractJsonBlock } from '../../utils/markdown.js'
import { renderToAttach } from '../../utils/template.js'

import type { Ai } from '../types.js'

export interface GenerateOverviewOptions {
  bookPath: string
  sessionUrl?: string
}

export interface GenerateOverviewResult {
  data: OverviewJson
  sessionUrl: string
}

/** 生成书籍概览；JSON 不合法时在同一个会话内持续纠正 */
export async function generateOverview(
  ai: Ai,
  opts: GenerateOverviewOptions,
): Promise<GenerateOverviewResult> {
  const bookFile = await attachToFile({ type: 'file', path: opts.bookPath })
  const promptFile = await renderToAttach('overview.prompt', '书籍概览编写提示词.md')

  let data: OverviewJson | undefined

  await ai.text2text({
    prompt: '按提示词为这本书编写概览 overview，以 json 代码块的格式回复',
    attaches: [bookFile, promptFile],
    sessionUrl: opts.sessionUrl,
    onResult: async (answer, append) => {
      const json = extractJsonBlock(answer)
      if (!json) {
        await append({ prompt: '请以 json 代码块的格式回复' })
        return
      }

      let failReason = ''
      if (!isOverviewJson(json, (reason) => (failReason = reason))) {
        await append({
          prompt: `概览校验未通过，请调整后重新输出完整 overview JSON：${failReason}`,
        })
        return
      }

      data = json
    },
  })

  if (!data) {
    throw new Error('概览生成失败：AI 未返回合法的 overview JSON')
  }

  return { data, sessionUrl: ai.getSessionUrl() }
}
