import { extname } from 'node:path'

import { ENABLE_JSON_CONTENT_JUDGE } from '../utils/env.js'

import { AiPageAdapter } from './adapter.js'
import DoubaoAiPageEngine from './engines/doubao.js'
import JimengAiPageEngine from './engines/jimeng.js'
import QianwenAiPageEngine from './engines/qianwen.js'
import WenxinAiPageEngine from './engines/wenxin.js'
import YuanbaoAiPageEngine from './engines/yuanbao.js'
import { CreditLimitError } from './error.js'

import type { Ai, AiPage } from './types.js'

/** 引擎能力类型 */
export type AiCapability = 'text' | 'work' | 'image' | 'watermark'

export interface PickEngineOptions {
  capability: AiCapability
  /** 本次需要上传的附件文件名；按引擎白名单过滤 */
  attachments?: string[]
  /**
   * 已有会话地址；命中时固定复用对应引擎，不参与优先级比较。
   * 该引擎若处于额度限制，直接抛 CreditLimitError 让任务退出，不切换到其他引擎。
   */
  sessionUrl?: string
  /** 需要排除的引擎名（切换引擎时避免选回自己） */
  exclude?: string[]
}

/** 引擎注册表：新增引擎时在这里注册 */
const ENGINE_FACTORIES: Array<() => AiPage> = [
  () => new QianwenAiPageEngine(),
  () => new DoubaoAiPageEngine(),
  () => new YuanbaoAiPageEngine(),
  () => new JimengAiPageEngine(),
  () => new WenxinAiPageEngine(),
]

function priorityOf(engine: AiPage, capability: AiCapability): number | null {
  if (capability === 'text') return engine.textPriority
  if (capability === 'work') return engine.workPriority
  if (capability === 'image') return engine.imagePriority
  return engine.watermarkPriority
}

function supportsAttachments(engine: AiPage, names: string[] = []): boolean {
  return names.every((name) => {
    const ext = extname(name).toLowerCase()
    return !ext || engine.supportedAttachmentExts.includes(ext)
  })
}

function matchSessionHost(engine: AiPage, sessionUrl: string): boolean {
  let host: string
  try {
    host = new URL(sessionUrl.trim()).hostname.toLowerCase()
  } catch {
    return false
  }

  return engine.sessionHosts.some((item) => host === item || host.endsWith(`.${item}`))
}

/**
 * 按能力选取引擎：
 * - 有历史会话且对应引擎支持该能力：固定复用；该引擎额度受限时抛
 *   CreditLimitError 直接退出任务，不降级到其他引擎；
 * - 否则按优先级从高到低，跳过不支持附件、处于额度限制的引擎；
 * - 全部候选都被额度限制时抛 CreditLimitError，交由角色层暂停任务。
 */
export async function pickEngine(opts: PickEngineOptions): Promise<AiPage | null> {
  const exclude = new Set(opts.exclude ?? [])
  const candidates = ENGINE_FACTORIES.map((create) => create())
    .filter((engine) => !exclude.has(engine.name))
    .filter(
      (engine) =>
        priorityOf(engine, opts.capability) !== null &&
        supportsAttachments(engine, opts.attachments),
    )

  if (opts.sessionUrl) {
    const resumed = candidates.find((engine) => matchSessionHost(engine, opts.sessionUrl!))
    if (resumed) {
      if (await resumed.disabled()) {
        throw new CreditLimitError(`会话所属引擎处于额度限制: ${resumed.name}`)
      }
      return resumed
    }
  }

  candidates.sort((a, b) => priorityOf(b, opts.capability)! - priorityOf(a, opts.capability)!)

  for (const engine of candidates) {
    if (!(await engine.disabled())) return engine
  }

  if (candidates.length > 0) {
    throw new CreditLimitError('所有可用 AI 引擎均处于额度限制')
  }
  return null
}

/**
 * 创建 JSON 文案判定的辅助 AI。
 * 判定失败不应阻塞生成，因此选不到引擎或全部受限时返回 undefined。
 */
export async function createJudgeAi(): Promise<Ai | undefined> {
  if (!ENABLE_JSON_CONTENT_JUDGE) return undefined

  try {
    const engine = await pickEngine({ capability: 'text' })
    return engine ? new AiPageAdapter(engine) : undefined
  } catch {
    return undefined
  }
}
