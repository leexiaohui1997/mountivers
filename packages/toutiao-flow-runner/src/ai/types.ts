import { randomUUID } from 'node:crypto'

import { activatePage, getPage, releasePage } from '../utils/browser.js'

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

  async activate(): Promise<void> {
    await this.engine.activate()
  }

  getSessionUrl(): string {
    return this.engine.getPageUrl()
  }
}

export abstract class AiPage {
  /** 引擎标识，用于日志与引擎切换 */
  abstract readonly name: string

  /** 该引擎生成的图片是否带水印；生图管线据此决定是否执行去水印 */
  abstract readonly hasWatermark: boolean

  /** 普通文生文优先级（判定/图检/修词等辅助任务）；数值越大越优先，null 表示不支持 */
  abstract readonly textPriority: number | null

  /** 业务内容生成优先级（概览/成稿/微头条等，通常带附件）；null 表示不支持 */
  abstract readonly workPriority: number | null

  /** 文生图优先级；null 表示不支持 */
  abstract readonly imagePriority: number | null

  /** 去水印（图生图）优先级；null 表示不支持 */
  abstract readonly watermarkPriority: number | null

  /** 支持的附件后缀白名单（小写、含点）；未列出的后缀不会选中该引擎 */
  readonly supportedAttachmentExts: readonly string[] = []

  /** 历史会话域名；用于按会话地址复用原引擎 */
  readonly sessionHosts: readonly string[] = []

  /** 额度/会员限制时返回 true；有历史会话时选取会忽略该状态 */
  async disabled(): Promise<boolean> {
    return false
  }

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

  /**
   * 额度/会员限制检测：命中时抛 CreditLimitError，供调用方与真实请求竞速。
   * 默认不检测，返回永不结束的 Promise；子类覆写时也应只在命中时抛错。
   */
  checkCreditLimit(): Promise<void> {
    return new Promise<void>(() => {})
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

  async activate(): Promise<void> {
    await this.ensurePage()
    await activatePage(this.page)
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
