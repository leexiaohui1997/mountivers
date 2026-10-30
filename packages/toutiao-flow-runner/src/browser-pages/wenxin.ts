import path from 'node:path'

import { Page } from 'playwright'

const WENXIN_HOME = 'https://wenxin.baidu.com/'

export default class WenxinPage {
  constructor(public page: Page) {}

  async ensureLogin() {
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

  async newSession() {
    await this.page.bringToFront()
    await this.ensureLogin()
  }

  async pasteImage(file: File) {
    const textarea = this.page.locator('textarea#chat-textarea').first()
    await textarea.waitFor({ state: 'visible' })
    await textarea.focus()

    // 对齐老项目:base64 字符串跨边界(纯字符串序列化最稳),浏览器内 atob 重建
    const buf = Buffer.from(await file.arrayBuffer())
    const b64 = buf.toString('base64')
    const ext = path.extname(file.name).toLowerCase()
    const mime =
      ext === '.jpg' || ext === '.jpeg'
        ? 'image/jpeg'
        : ext === '.webp'
          ? 'image/webp'
          : 'image/png'

    await this.page.evaluate(
      async (payload: { b64: string; name: string; mime: string }) => {
        const bin = atob(payload.b64)
        const arr = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
        const f = new File([arr], payload.name, { type: payload.mime })

        const dt = new DataTransfer()
        dt.items.add(f)
        const ta = document.querySelector('textarea#chat-textarea') as HTMLElement | null
        if (!ta) throw new Error('未找到文心一言输入框')
        ta.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
        )
      },
      { b64, name: file.name, mime },
    )
    await this.page.waitForTimeout(1500)
  }

  async input(text: string) {
    const textarea = this.page.locator('textarea#chat-textarea').first()
    await textarea.waitFor({ state: 'visible' })
    await textarea.focus()
    await this.page.keyboard.insertText(text)
  }

  async send() {
    const sendBtn = this.page.locator('span.ci-submit-button').first()
    await sendBtn.waitFor({ state: 'visible', timeout: 10000 })
    await this.page
      .locator('span.ci-submit-button img.ci-submit-button-ai-active')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
    await sendBtn.click()
  }

  async getImageAnswer() {
    const img = this.page
      .locator('.chat-qa-container div.conversation-flow-answer-container')
      .last()
      .locator('div.cosd-image-scroll img.cos-image-body')
      .first()
    await img.waitFor({ state: 'attached', timeout: 45_000 })
    const src = await img.getAttribute('src')
    if (!src) throw new Error('去水印结果图 src 为空')
    return src
  }
}
