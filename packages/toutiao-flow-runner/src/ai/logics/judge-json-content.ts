import {
  isJsonContentCheck,
  type JsonContentCheck,
  type JsonContentIssue,
} from '../../types/json-check.js'
import { attachToFile } from '../../utils/attach.js'
import { extractJsonBlock } from '../../utils/markdown.js'
import { renderToAttach } from '../../utils/template.js'

import {
  AttachmentMissingError,
  ATTACHMENT_MISSING_INSTRUCTION,
  parseAttachmentMissing,
  type AttachmentMissing,
} from './attachment-missing.js'

import type { Ai } from '../types.js'

export type JsonContentKind = 'overview' | 'article' | 'micro-headline'

const KIND_LABELS: Record<JsonContentKind, string> = {
  overview: '书籍概览',
  article: '成稿文章',
  'micro-headline': '微头条',
}

/** 判定附件连续缺失时，最多重开会话尝试的次数 */
const MAX_ATTACHMENT_ATTEMPTS = 3

export interface JudgeJsonContentOptions {
  kind: JsonContentKind
  data: unknown
}

/** 用独立的判定 AI 检查 JSON 是否包含占位符、模板残留或待补内容 */
export async function judgeJsonContent(
  ai: Ai,
  opts: JudgeJsonContentOptions,
): Promise<JsonContentCheck> {
  const promptFile = await renderToAttach(
    'json-content-check.prompt',
    {
      kind: opts.kind,
      kindLabel: KIND_LABELS[opts.kind],
    },
    '文案检查提示词.md',
  )
  const dataFile = await attachToFile({
    type: 'markdown',
    filename: '待检查文案.json',
    content: JSON.stringify(opts.data, null, 2),
  })

  let lastMissing: string[] = []

  for (let attempt = 1; attempt <= MAX_ATTACHMENT_ATTEMPTS; attempt++) {
    const state: {
      result?: JsonContentCheck
      missing: AttachmentMissing | null
    } = { missing: null }

    // 每次调用 text2text 都会重新 openSession；附件漏传时在判定逻辑内重开会话重试
    await ai.text2text({
      prompt: `请按照附件《文案检查提示词.md》检查附件《待检查文案.json》，只返回判定 JSON。${ATTACHMENT_MISSING_INSTRUCTION}`,
      attaches: [promptFile, dataFile],
      onResult: async (answer, append) => {
        state.missing = parseAttachmentMissing(answer)
        if (state.missing) return

        const json = extractJsonBlock(answer)
        if (!json) {
          await append({ prompt: '请只返回合法的 JSON 代码块' })
          return
        }

        let failReason = ''
        if (!isJsonContentCheck(json, (reason) => (failReason = reason))) {
          await append({
            prompt: `判定结果 JSON 格式不符合要求，请修正后重新输出：\n${failReason}`,
          })
          return
        }

        state.result = json
      },
    })

    if (state.missing) {
      lastMissing = state.missing.missing ?? []
      console.warn(
        `[json-judge] ${opts.kind} 第 ${attempt}/${MAX_ATTACHMENT_ATTEMPTS} 次附件缺失，重开会话重试: ${
          lastMissing.join('、') || '未知附件'
        }`,
      )
      continue
    }

    if (state.result) return state.result
    throw new Error('JSON 文案判定失败：AI 未返回合法结果')
  }

  throw new AttachmentMissingError(lastMissing)
}

/** 判定失败时，拼成给生成 AI 的修复提示 */
export function buildJudgeRepair(issues: JsonContentIssue[]): string {
  const lines = issues.length
    ? issues.map((issue) => `- ${issue.path || '(root)'}：${issue.reason}`)
    : ['- 内容仍包含占位符或待补信息，请重新生成完整内容']

  return `以下 JSON 内容仍然不可用，请修正后重新输出完整 JSON：\n${lines.join('\n')}`
}

/** 判定封装：判定 AI 自身失败时 fail open，避免阻塞生成流水线 */
export async function reviewJsonContent(
  judgeAi: Ai | undefined,
  mainAi: Ai,
  kind: JsonContentKind,
  data: unknown,
): Promise<{ pass: boolean; check?: JsonContentCheck }> {
  if (!judgeAi) return { pass: true }

  try {
    const check = await judgeJsonContent(judgeAi, { kind, data })
    return { pass: check.pass, check }
  } catch (error) {
    if (error instanceof AttachmentMissingError) {
      throw error
    }

    console.error(
      `[json-judge] ${kind} 判定失败，按通过处理: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return { pass: true }
  }
}
