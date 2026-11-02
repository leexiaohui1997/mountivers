import { isOverviewJson, type OverviewJson } from '../../types/overview.js'
import { attachToFile } from '../../utils/attach.js'
import { extractJsonBlock } from '../../utils/markdown.js'
import { renderToAttach } from '../../utils/template.js'

import { ATTACHMENT_MISSING_INSTRUCTION, throwIfAttachmentMissing } from './attachment-missing.js'
import { buildJudgeRepair, reviewJsonContent } from './judge-json-content.js'

import type { Ai } from '../types.js'

export interface GenerateOverviewOptions {
  bookPath: string
  sessionUrl?: string
  judgeAi?: Ai
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
    prompt: `按提示词为这本书编写概览 overview，以 json 代码块的格式回复。${ATTACHMENT_MISSING_INSTRUCTION}`,
    attaches: [bookFile, promptFile],
    sessionUrl: opts.sessionUrl,
    onResult: async (answer, append) => {
      throwIfAttachmentMissing(answer)

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

      const review = await reviewJsonContent(opts.judgeAi, ai, 'overview', json)
      if (!review.pass) {
        await ai.activate()
        await append({ prompt: buildJudgeRepair(review.check?.issues ?? []) })
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
