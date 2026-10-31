import { activatePage } from '../../utils/browser.js'
import { AiPage } from '../types.js'

const QIANWEN_URL = 'https://www.qianwen.com/'
const COPY_MAX_ATTEMPTS = 4

/**
 * 千问引擎：当前只实现文本能力；图片相关方法留空。
 * 页面由 AiPage 自行获取和释放。
 */
export default class QianwenAiPageEngine extends AiPage {
  private loggedIn = false

  async ensureLogin(): Promise<void> {
    await this.ensurePage()
    if (this.loggedIn) return

    await this.page.goto(QIANWEN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

    await Promise.all([
      (async () => {
        await this.page
          .locator('#new-nav-tab-wrapper img[src*="imgextra"]')
          .first()
          .waitFor({ state: 'visible', timeout: 0 })
        this.loggedIn = true
      })(),
      (async () => {
        const loginButton = this.page.locator('button:has-text("登录")').first()
        const hasButton = await loginButton
          .waitFor({ state: 'visible', timeout: 3000 })
          .then(() => true)
          .catch(() => false)
        if (!hasButton) return

        await loginButton.click()
        console.log('[千问] 请完成登录')
      })(),
    ])
  }

  async openSession(url?: string): Promise<void> {
    await this.ensurePage()
    await activatePage(this.page)
    await this.ensureLogin()

    const target = url && url.startsWith(QIANWEN_URL) ? url : QIANWEN_URL
    if (this.page.url() !== target) {
      await this.page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 })
    }

    // 新会话需要切到「思考研究」；已有会话直接复用
    if (target === QIANWEN_URL) {
      // await this.enableThinkingMode()
    }
  }

  /** 千问当前不走图片模式 */
  async setImageMode(): Promise<void> {
    return
  }

  async clearInput(): Promise<void> {
    await this.ensurePage()
    const box = this.page.locator('[role="textbox"][contenteditable="true"]').first()
    await box.waitFor({ state: 'visible', timeout: 3000 })
    await box.click()

    const selectAll = process.platform === 'darwin' ? 'Meta+A' : 'Control+A'
    await this.page.keyboard.press(selectAll)
    await this.page.keyboard.press('Backspace')
    await this.page.waitForTimeout(300)
  }

  async clearFiles(): Promise<void> {
    while (true) {
      const item = this.page.locator('[class^="fileBox-"]').first()
      const exists = await item
        .waitFor({ state: 'visible', timeout: 1000 })
        .then(() => true)
        .catch(() => false)
      if (!exists) break

      await item.hover()
      await this.page.waitForTimeout(300)
      const closeAction = item.locator('[data-icon-type="qwpcicon-close2"]').first()
      await closeAction.waitFor({ state: 'visible' })
      await closeAction.click()
      await this.page.waitForTimeout(300)
    }
  }

  async clearEditor(): Promise<void> {
    await this.ensurePage()
    await this.clearFiles()
    await this.clearInput()
  }

  /** 文本上传暂不支持 */
  async uploadFile(file: File): Promise<void> {
    await this.ensurePage()
    const addToolsAction = this.page
      .locator('[data-chat-input-shell] button[aria-label="添加附件"]')
      .first()
    await addToolsAction.waitFor({ state: 'visible' })
    await addToolsAction.click()
    await this.page.waitForTimeout(300)
    // 图片作为 text2text 附件时走「上传图片」，普通文档走「本地文件」
    const menuText = file.type.startsWith('image/') ? '上传图片' : '上传文档'
    const trigger = this.page.locator(`[role="menuitem"]:has-text("${menuText}")`).first()
    await trigger.waitFor({ state: 'visible' })
    const [chooser] = await Promise.all([this.page.waitForEvent('filechooser'), trigger.click()])
    await chooser.setFiles({
      name: file.name,
      mimeType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
    })
  }

  /** 图片上传暂不支持 */
  async uploadImage(): Promise<void> {
    return
  }

  async input(text: string): Promise<void> {
    await this.ensurePage()
    const box = this.page.locator('[role="textbox"][contenteditable="true"]').first()
    await box.waitFor({ state: 'visible', timeout: 3000 })
    await box.click()

    await this.page.keyboard.insertText(text)
    await this.page.waitForTimeout(300)
  }

  async send(): Promise<void> {
    await this.ensurePage()
    const sendButton = this.page
      .locator(
        'button[data-session-switch-target="send-query"][aria-label="发送消息"]:not([disabled])',
      )
      .first()
    await sendButton.waitFor({ state: 'visible' })
    await sendButton.click()
    await this.page.waitForTimeout(300)
  }

  async getAnswer(): Promise<string> {
    await this.ensurePage()

    const readClipboard = () =>
      this.page.evaluate(async () => {
        return await navigator.clipboard.readText()
      })

    // 复制前先记录剪贴板内容；复制后内容变化才算成功，最多尝试 4 次
    // 下一轮的 before 直接复用上一轮的 after，不再重复读取剪贴板
    let before = await readClipboard()

    for (let attempt = 1; attempt <= COPY_MAX_ATTEMPTS; attempt++) {
      const copyButton = this.page
        .locator('#message-list-scroller')
        .locator('.message-select-wrapper-answer-rqWekn')
        .last()
        .locator('[data-answer-feedback-toolbar="true"] > .flex > .flex')
        .first()
      await copyButton.waitFor({ state: 'attached', timeout: 0 })
      await copyButton.scrollIntoViewIfNeeded()
      await copyButton.dispatchEvent('mouseover')

      const copyItem = this.page.locator('[role="menuitem"]:has-text("复制为Markdown")').first()
      await copyItem.waitFor({ state: 'visible' })
      await copyItem.click()
      await this.page.waitForTimeout(1000)

      const after = await readClipboard()
      if (after !== before) {
        return after
      }

      console.log(
        `[千问] 复制回答后剪贴板内容未变化（第 ${attempt}/${COPY_MAX_ATTEMPTS} 次），重试`,
      )
      before = after
    }

    // 超过重试上限：返回当前剪贴板内容，避免中断后续流程
    console.warn(`[千问] 复制回答连续 ${COPY_MAX_ATTEMPTS} 次剪贴板内容未变化，返回当前剪贴板内容`)
    return before
  }

  /** 千问当前不支持图片生成 */
  async getImageAnswer(): Promise<string> {
    return ''
  }

  async release(): Promise<void> {
    await super.release()
    this.loggedIn = false
  }

  /** 新会话切换到「思考研究」模式 */
  private async enableThinkingMode(): Promise<void> {
    const trigger = this.page.locator('button[aria-label="快速"]').first()
    await trigger.waitFor({ state: 'visible', timeout: 3000 })
    await trigger.click()

    const item = this.page
      .locator('div[role="menuitemcheckbox"] span.text-primary:has-text("思考研究")')
      .first()
    await item.waitFor({ state: 'visible', timeout: 3000 })
    await item.click()
  }
}
