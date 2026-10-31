import { randomUUID } from 'node:crypto'

import { getPage, releasePage } from '../utils/browser.js'

import type { Page } from 'playwright'

export type InputArgs = {
  prompt: string
  attaches?: File[]
  /** 复用的 AI 会话地址；不传则由引擎打开默认新会话 */
  sessionUrl?: string
}

export type TextToTextAppendFunc = (args: InputArgs) => Promise<void>

export type TextToTextFunc = (
  opts: InputArgs & {
    onResult?: (result: string, appendFunc: TextToTextAppendFunc) => Promise<void>
  },
) => Promise<string>

export type TextToImageFunc = (opts: InputArgs) => Promise<string>

export type ImageToImageFunc = (opts: { image: File; prompt: string }) => Promise<string>

export abstract class Ai {
  constructor(public engine: AiPage) {}

  abstract text2text: TextToTextFunc
  abstract text2Image: TextToImageFunc
  abstract image2image: ImageToImageFunc
  abstract release(): Promise<void>

  getSessionUrl(): string {
    return this.engine.getPageUrl()
  }
}

export abstract class AiPage {
  /** 随机页面 id，用于 getPage 缓存与释放 */
  readonly pageId: string
  private _page: Page | null = null

  constructor(pageId = randomUUID()) {
    this.pageId = pageId
  }

  /** 首次使用时获取页面；engine 自己维护 page 生命周期 */
  protected async ensurePage(): Promise<Page> {
    if (!this._page) {
      this._page = await getPage(this.pageId)
    }
    return this._page
  }

  /** 公共方法内部使用；未初始化时直接报错，避免静默操作空页面 */
  protected get page(): Page {
    if (!this._page) {
      throw new Error('AI 页面尚未初始化，请先调用 openSession()')
    }
    return this._page
  }

  getPageUrl(): string {
    return this.page.url()
  }

  async release(): Promise<void> {
    try {
      if (this._page) {
        await releasePage(this._page)
      }
    } finally {
      this._page = null
    }
  }

  abstract ensureLogin(): Promise<void>
  abstract openSession(url?: string): Promise<void>
  abstract setImageMode(): Promise<void>
  abstract clearEditor(): Promise<void>
  abstract uploadFile(file: File): Promise<void>
  abstract uploadImage(file: File): Promise<void>
  abstract input(text: string): Promise<void>
  abstract send(): Promise<void>
  abstract getAnswer(): Promise<string>
  abstract getImageAnswer(): Promise<string>
}
