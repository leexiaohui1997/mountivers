import {
  isMicroHeadlineData,
  validateMicroHeadline,
  type MicroHeadlineData,
} from '../../types/micro-headline.js'
import { attachToFile } from '../../utils/attach.js'
import { extractJsonBlock } from '../../utils/markdown.js'
import { renderToAttach } from '../../utils/template.js'

import type { OverviewJson } from '../../types/overview.js'
import type { Ai } from '../types.js'

export interface GenerateMicroHeadlineOptions {
  bookPath: string
  overview: OverviewJson
  excludeTopics?: string[]
  sessionUrl?: string
}

export interface GenerateMicroHeadlineResult {
  data: MicroHeadlineData
  sessionUrl: string
}

/** 生成一条微头条；JSON/schema/字数/图片比例/话题去重不通过时持续纠正 */
export async function generateMicroHeadline(
  ai: Ai,
  opts: GenerateMicroHeadlineOptions,
): Promise<GenerateMicroHeadlineResult> {
  const bookFile = await attachToFile({ type: 'file', path: opts.bookPath })
  const promptFile = await renderToAttach(
    'micro-headline.prompt',
    {
      bookTitle: opts.overview.bookTitle,
      illustrationStyle: opts.overview.illustrationPromptTemplate,
      excludeTopics: opts.excludeTopics ?? [],
    },
    '微头条创作提示词.md',
  )

  let data: MicroHeadlineData | undefined

  await ai.text2text({
    prompt: '按提示词为这本书创作一条微头条，以 json 代码块的格式回复',
    attaches: [bookFile, promptFile],
    sessionUrl: opts.sessionUrl,
    onResult: async (answer, append) => {
      const json = extractJsonBlock(answer)
      if (!json) {
        await append({ prompt: '请以 json 代码块的格式回复' })
        return
      }

      let failReason = ''
      if (!isMicroHeadlineData(json, (reason) => (failReason = reason))) {
        await append({ prompt: `微头条 JSON 结构不符合要求，请修正：\n${failReason}` })
        return
      }

      // path 只由生图角色回填，不能信任 AI 返回值
      const normalized: MicroHeadlineData = {
        ...json,
        images: json.images.map((image) => ({ prompt: image.prompt })),
      }

      const violations = validateMicroHeadline(normalized, opts.excludeTopics ?? [])
      if (violations.length) {
        await append({
          prompt: `微头条校验未通过，请调整后重新输出完整 JSON：\n${violations
            .map((item) => `- ${item}`)
            .join('\n')}`,
        })
        return
      }

      data = normalized
    },
  })

  if (!data) {
    throw new Error('微头条生成失败：AI 未返回合法数据')
  }

  return { data, sessionUrl: ai.getSessionUrl() }
}
