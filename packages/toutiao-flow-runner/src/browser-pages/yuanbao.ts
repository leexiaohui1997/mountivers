import { Page } from 'playwright'

const YUANBAO_URL = 'https://yuanbao.tencent.com/'
const NEW_SESSION_URL = `${YUANBAO_URL}chat/naQivTmsDa`

export default class YuanBaoPage {
  constructor(public page: Page) {}

  async ensureLogin() {
    const url = this.page.url()
    if (!url.startsWith(YUANBAO_URL)) {
      await this.page.goto(YUANBAO_URL, { waitUntil: 'domcontentloaded' })
    }

    while (true) {
      const avatarImg = this.page.locator('.yb-common-nav__ft__avatar .image-container img').first()
      await avatarImg.waitFor({ state: 'visible' })
      const avatarSrc = await avatarImg.getAttribute('src')

      if (avatarSrc && avatarSrc.includes('avatar.yuanbao.tencent.com')) {
        break
      }

      await avatarImg.dispatchEvent('click')
      await this.page.waitForTimeout(300)
      const loginCotent = this.page.locator('.hyc-login__content').first()
      await loginCotent.waitFor({ state: 'visible' })
      console.log('[元宝] 请扫码完成登录')
      await Promise.race([
        loginCotent.waitFor({ state: 'hidden', timeout: 0 }),
        loginCotent.waitFor({ state: 'detached', timeout: 0 }),
      ])
      await new Promise((r) => setTimeout(r, 3000))
    }
  }

  async newSession() {
    await this.ensureLogin()
    const url = this.page.url()
    if (!url.startsWith(NEW_SESSION_URL)) {
      await this.page.goto(NEW_SESSION_URL)
    }
    await this.page.waitForLoadState('domcontentloaded')
  }

  async uploadFile(file: File) {
    const addToolsAction = this.page
      .locator('[data-new-input-card] [data-new-input-control="add-tools"]')
      .first()
    await addToolsAction.waitFor({ state: 'visible' })
    await addToolsAction.click()
    await this.page.waitForTimeout(300)
    const trigger = this.page.locator('button[role="menuitem"]:has-text("本地文件")').first()
    await trigger.waitFor({ state: 'visible' })
    const [chooser] = await Promise.all([this.page.waitForEvent('filechooser'), trigger.click()])
    await chooser.setFiles({
      name: file.name,
      mimeType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
    })
  }

  async clearFiles() {
    while (true) {
      const item = this.page.locator('[class^="FileList_inputFileListItem"]').first()
      const exists = await item
        .waitFor({ state: 'visible', timeout: 1000 })
        .then(() => true)
        .catch(() => false)
      if (!exists) break
      await item.hover()
      await this.page.waitForTimeout(300)
      const closeAction = item.locator('[class^="FileList_inputFileListItemClose"]').first()
      await closeAction.waitFor({ state: 'visible' })
      await closeAction.click()
      await this.page.waitForTimeout(300)
    }
  }

  async clearInput() {
    const editor = this.page.locator('.ql-editor[contenteditable="true"]').first()
    await editor.waitFor({ state: 'visible' })
    await editor.click()

    // 1. 平台正确的全选快捷键(Windows=Control+A,macOS=Meta+A)
    const selectAll = process.platform === 'darwin' ? 'Meta+A' : 'Control+A'
    await this.page.keyboard.press(selectAll)
    await this.page.keyboard.press('Delete')
    await this.page.waitForTimeout(150)

    // 2. 兜底:若仍有残留文本,直接清空 Quill 内容并触发 input 事件同步其内部状态
    const stillHas = await editor.evaluate((el) => (el.textContent ?? '').trim().length)
    if (stillHas > 0) {
      await editor.evaluate((el) => {
        el.innerHTML = ''
        el.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
  }

  async clearEditor() {
    await this.clearFiles()
    await this.clearInput()
  }

  async input(text: string) {
    const editor = this.page.locator('.ql-editor[contenteditable="true"]').first()
    await editor.waitFor({ state: 'visible' })
    await editor.click()
    await this.page.keyboard.insertText(text)
    await this.page.waitForTimeout(300)
  }

  async send() {
    const sendBtn = this.page
      .locator('#yuanbao-send-btn:not([class*="SendButton_sendNot"])')
      .first()
    await sendBtn.waitFor({ state: 'visible' })
    await sendBtn.click()
    await this.page.waitForTimeout(300)
  }

  async getAnswer() {
    await this.page.waitForTimeout(2000)
    const copyTrigger = this.page.locator(
      '.agent-chat__list__item--last [class^="ToolbarCopy_arrowIconWrap"]',
    )
    await copyTrigger.waitFor({ state: 'attached', timeout: 0 })
    await copyTrigger.scrollIntoViewIfNeeded()
    await copyTrigger.click()
    const copyBtn = this.page.locator('.t-dropdown__item:has-text("复制为Markdown")').first()
    await copyBtn.waitFor({ state: 'visible' })
    await copyBtn.click()
    await this.page
      .locator('.t-message__list:has-text("回答复制成功")')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
    const text = await this.page.evaluate(async () => {
      return await navigator.clipboard.readText()
    })
    return text
  }
}
