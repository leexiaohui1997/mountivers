import { z } from 'zod'

import { extractJsonBlock } from '../../utils/markdown.js'

const AttachmentMissingSchema = z.object({
  error: z.literal('ATTACHMENT_MISSING'),
  missing: z.array(z.string()).optional(),
})

export type AttachmentMissing = z.infer<typeof AttachmentMissingSchema>

/** 附件缺失时要求 AI 返回固定结构；同时放进用户提示词，避免提示词附件本身漏传 */
export const ATTACHMENT_MISSING_INSTRUCTION =
  '如果附件没有成功上传，或你无法读取附件内容，不要猜测、不要编造，也不要输出正式内容。只返回一个 JSON 代码块：{"error":"ATTACHMENT_MISSING","missing":["缺失的附件名称"]}。'

/** 识别 AI 返回的附件缺失结构 */
export function parseAttachmentMissing(answer: string): AttachmentMissing | null {
  const candidates: unknown[] = [extractJsonBlock(answer)]

  const trimmed = answer.trim()
  if (trimmed.startsWith('{')) {
    try {
      candidates.push(JSON.parse(trimmed) as unknown)
    } catch {
      // 忽略无法解析的原始文本
    }
  }

  for (const candidate of candidates) {
    if (!candidate) continue

    const result = AttachmentMissingSchema.safeParse(candidate)
    if (result.success) return result.data
  }

  return null
}

export class AttachmentMissingError extends Error {
  constructor(public readonly missing: string[]) {
    super(`AI 判定附件缺失: ${missing.join('、') || '未知附件'}`)
    this.name = 'AttachmentMissingError'
  }
}

export function throwIfAttachmentMissing(answer: string): void {
  const missing = parseAttachmentMissing(answer)
  if (missing) {
    throw new AttachmentMissingError(missing.missing ?? [])
  }
}
