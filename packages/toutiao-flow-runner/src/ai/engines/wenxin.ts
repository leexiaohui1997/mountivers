import path from 'node:path'

import { activatePage } from '../../utils/browser.js'
import { AiPage } from '../types.js'

const WENXIN_HOME = 'https://wenxin.baidu.com/'

/**
 * 文心引擎：当前用于图片处理（上传图片 + 文本指令 → 图片）。
 * 文本生成能力暂不实现，getAnswer / uploadFile 为空实现。
 */
export default class WenxinAiPageEngine extends AiPage {
  async ensureLogin(): Promise<void> {
    await this.ensurePage()
    const url = this.page.url()
    if (!url.startsWith(WENXIN_HOME)) {
      await this.page.goto(WENXIN_HOME)
    }
    await this.page.waitForLoadState('domcontentloaded')

    const avatarImg = this.page.locator('img.chat-aside-avatar-content').first()
    const isLoggedIn = async (): Promise<boolean> => {
      if ((await avatarImg.count()) === 0) return false
      const src = (await avatarImg.getAttribute('src')) ?? ''
      return src.includes('himg.bdimg.com')
    }

    if (!(await isLoggedIn())) {
      console.log('[wenxin] 未登录，请在浏览器中完成登录（扫码/账号）')
      await this.page
        .locator('img.chat-aside-avatar-content[src*="himg.bdimg.com"]')
        .waitFor({ state: 'visible', timeout: 0 })
      console.log('[wenxin] 已完成登录')
    }
  }

  async openSession(url?: string): Promise<void> {
    await this.ensurePage()
    await activatePage(this.page)
    await this.ensureLogin()
    if (url && url.startsWith(WENXIN_HOME) && this.page.url() !== url) {
      await this.page.goto(url)
      await this.page.waitForLoadState('domcontentloaded')
    }
  }

  /** 文心没有独立的图片模式 */
  async setImageMode(): Promise<void> {
    return
  }

  async clearEditor(): Promise<void> {
    await this.ensurePage()
    const textarea = this.page.locator('textarea#chat-textarea').first()
    await textarea.waitFor({ state: 'visible' })
    await textarea.fill('')
  }

  /** 文本生成暂不支持 */
  async uploadFile(): Promise<void> {
    return
  }

  async uploadImage(file: File): Promise<void> {
    await this.ensurePage()
    const textarea = this.page.locator('textarea#chat-textarea').first()
    await textarea.waitFor({ state: 'visible' })
    await textarea.focus()

    // 对齐老项目：base64 跨边界，浏览器内重建 File 后触发 paste
    const buffer = Buffer.from(await file.arrayBuffer())
    const base64 = buffer.toString('base64')
    const ext = path.extname(file.name).toLowerCase()
    const mime =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/png'

    await this.page.evaluate(
      async (payload: { base64: string; name: string; mime: string }) => {
        const binary = atob(payload.base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

        const imageFile = new File([bytes], payload.name, { type: payload.mime })
        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(imageFile)

        const target = document.querySelector('textarea#chat-textarea') as HTMLElement | null
        if (!target) throw new Error('未找到文心一言输入框')
        target.dispatchEvent(
          new ClipboardEvent('paste', {
            clipboardData: dataTransfer,
            bubbles: true,
            cancelable: true,
          }),
        )
      },
      { base64, name: file.name, mime },
    )
    await this.page.waitForTimeout(1500)
  }

  async input(text: string): Promise<void> {
    await this.ensurePage()
    const textarea = this.page.locator('textarea#chat-textarea').first()
    await textarea.waitFor({ state: 'visible' })
    await textarea.focus()
    await this.page.keyboard.insertText(text)
  }

  async send(): Promise<void> {
    await this.ensurePage()
    const sendButton = this.page.locator('span.ci-submit-button').first()
    await sendButton.waitFor({ state: 'visible', timeout: 10000 })
    await this.page
      .locator('span.ci-submit-button img.ci-submit-button-ai-active')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
    await sendButton.click()
  }

  /** 文本生成暂不支持 */
  async getAnswer(): Promise<string> {
    return ''
  }

  async getImageAnswer(): Promise<string> {
    await this.ensurePage()
    const image = this.page
      .locator('.chat-qa-container div.conversation-flow-answer-container')
      .last()
      .locator('div.cosd-image-scroll img.cos-image-body')
      .first()
    await image.waitFor({ state: 'attached', timeout: 45_000 })

    const src = await image.getAttribute('src')
    if (!src) throw new Error('文心出图结果图 src 为空')
    return src
  }
}
