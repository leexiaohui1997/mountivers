import { extname } from 'node:path'

import { getJimengCreditState } from '../utils/jimeng-credit.js'

import JimengAiPageEngine from './engines/jimeng.js'
import QianwenAiPageEngine from './engines/qianwen.js'
import WenxinAiPageEngine from './engines/wenxin.js'
import YuanbaoAiPageEngine from './engines/yuanbao.js'

import type { AiPage } from './types.js'

export type GetEngineParams = {
  /** 书籍文件后缀，支持 `pdf`、`.pdf`、`book.pdf` 等写法，大小写不敏感 */
  ext?: string
  /** 已存在的 AI 会话地址；优先按会话所属平台复用原引擎 */
  sessionUrl?: string
}

/** 统一后缀格式：去空白、转小写、去掉开头的点；也支持直接传完整文件名 */
export function normalizeExt(ext: string | null | undefined): string {
  const value = (ext ?? '').trim().toLowerCase()
  if (!value) return ''

  const fromPath = extname(value)
  return (fromPath || value).replace(/^\./, '')
}

/** 书籍后缀 → 文本引擎；新增引擎时在这里注册即可 */
const ENGINE_FACTORIES: Record<string, () => AiPage> = {
  pdf: () => new YuanbaoAiPageEngine(),
  epub: () => new QianwenAiPageEngine(),
  mobi: () => new QianwenAiPageEngine(),
}

/** 会话域名 → 引擎工厂；用于沿用书籍历史会话 */
const SESSION_ENGINE_FACTORIES: Array<{
  host: string
  create: () => AiPage
}> = [
  { host: 'yuanbao.tencent.com', create: () => new YuanbaoAiPageEngine() },
  { host: 'jimeng.jianying.com', create: () => new JimengAiPageEngine() },
  { host: 'wenxin.baidu.com', create: () => new WenxinAiPageEngine() },
  { host: 'qianwen.com', create: () => new QianwenAiPageEngine() },
]

/** 根据 sessionUrl 的域名判断原本使用的是哪个引擎 */
export function getEngineBySessionUrl(sessionUrl: string): AiPage | null {
  let host: string
  try {
    host = new URL(sessionUrl.trim()).hostname.toLowerCase()
  } catch {
    return null
  }

  const matched = SESSION_ENGINE_FACTORIES.find(
    (entry) => host === entry.host || host.endsWith(`.${entry.host}`),
  )
  return matched ? matched.create() : null
}

/**
 * 根据书籍文件后缀选择引擎。
 * 未传 ext 时使用默认元宝；后缀不支持时返回 null，由调用方决定报错或回退。
 */
export async function getEngine(params?: GetEngineParams): Promise<AiPage | null> {
  // 有历史会话时优先沿用原平台，避免策略调整后串到别的引擎
  if (params?.sessionUrl) {
    const sessionEngine = getEngineBySessionUrl(params.sessionUrl)
    if (sessionEngine) return sessionEngine
  }

  const ext = normalizeExt(params?.ext)
  if (!ext) {
    return new YuanbaoAiPageEngine()
  }

  return getEngineByExt(ext)
}

export async function getEngineByExt(ext: string): Promise<AiPage | null> {
  const factory = ENGINE_FACTORIES[normalizeExt(ext)]
  return factory ? factory() : null
}

/**
 * 图片生成引擎选择：
 * - 即梦积分状态为 0 且未过期 → 元宝；
 * - 无状态/状态过期/剩余积分 > 0 → 先尝试即梦。
 */
export async function getImageEngine(): Promise<AiPage> {
  const creditState = await getJimengCreditState()
  if (creditState && creditState.remainingCredit <= 0) {
    return new YuanbaoAiPageEngine()
  }

  return new JimengAiPageEngine()
}
