import { activatePage } from '../../utils/browser.js'
import { AiPage } from '../types.js'

const KIMI_URL = 'https://www.kimi.com/'
const COPY_MAX_ATTEMPTS = 4

/**
 * Kimi 引擎。
 *
 * 文本任务排在豆包之后，业务内容生成排在千问之后、元宝之前。
 */
export default class KimiAiPageEngine extends AiPage {
  readonly name = 'kimi'

  readonly textPriority = 5
  readonly workPriority = 25
  readonly imagePriority = null
  readonly watermarkPriority = null

  readonly supportedAttachmentExts = [
    '.pdf',
    '.epub',
    '.mobi',
    '.md',
    '.txt',
    '.png',
    '.jpg',
    '.jpeg',
    '.webp',
  ]
  readonly sessionHosts = ['kimi.com']

  readonly hasWatermark = false

  async ensureLogin(): Promise<void> {
    await this.ensurePage()
    if (!this.page.url().startsWith(KIMI_URL)) {
      await this.page.goto(KIMI_URL)
    }
    await this.page.waitForLoadState('domcontentloaded')

    const avatar = this.page.locator('.user-avatar').first()
    const loginButton = this.page.locator('.login-button').first()

    const { hasAvatar = false, hasLoginButton = false } = await Promise.race<{
      hasAvatar?: boolean
      hasLoginButton?: boolean
    }>([
      (async () => ({
        hasAvatar: await avatar
          .waitFor({ state: 'visible', timeout: 3000 })
          .then(() => true)
          .catch(() => false),
      }))(),
      (async () => ({
        hasLoginButton: await loginButton
          .waitFor({ state: 'visible', timeout: 3000 })
          .then(() => true)
          .catch(() => false),
      }))(),
    ])

    if (hasAvatar) return
    if (hasLoginButton) {
      await loginButton.click()
    }
    console.log('[kimi] 请完成登录')
    await avatar.waitFor({ state: 'visible', timeout: 0 })
  }

  async openSession(url?: string): Promise<void> {
    await this.ensurePage()
    await activatePage(this.page)
    await this.ensureLogin()

    const target = url && url.startsWith(KIMI_URL) ? url : KIMI_URL
    if (this.page.url() !== target) {
      await this.page.goto(target)
    }
    await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 })
    await this.setModel()
  }

  async setImageMode(): Promise<void> {
    // TODO: Kimi 当前只规划文本能力；如果后续支持生图再实现
    throw new Error('KimiAiPageEngine.setImageMode 尚未实现')
  }

  async clearEditor(): Promise<void> {
    await this.ensurePage()
    await this.clearFiles()
    await this.clearInput()
  }

  async uploadFile(file: File): Promise<void> {
    await this.ensurePage()
    const addToolsAction = this.page.locator('.toolkit-trigger-btn').first()
    await addToolsAction.waitFor({ state: 'visible' })
    await addToolsAction.click()
    await this.page.waitForTimeout(300)
    const trigger = this.page.locator('[role="menuitem"]:has-text("添加文件与图片")').first()
    await trigger.waitFor({ state: 'visible' })
    const [chooser] = await Promise.all([this.page.waitForEvent('filechooser'), trigger.click()])
    await chooser.setFiles({
      name: file.name,
      mimeType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
    })
  }

  async uploadImage(file: File): Promise<void> {
    // TODO: 上传图片；如果 Kimi 文本能力支持图片可复用 uploadFile
    void file
    throw new Error('KimiAiPageEngine.uploadImage 尚未实现')
  }

  async input(text: string): Promise<void> {
    await this.ensurePage()
    const editor = this.page.locator('.chat-input-editor[contenteditable="true"]').first()
    await editor.waitFor({ state: 'visible' })
    await editor.click()
    await this.page.keyboard.insertText(text)
    await this.page.waitForTimeout(300)
  }

  async send(): Promise<void> {
    await this.ensurePage()
    const sendButton = this.page.locator('.send-button-container:not(.disabled)').first()
    await sendButton.waitFor({ state: 'visible' })
    await sendButton.click()
    await this.page.waitForTimeout(300)
  }

  async getAnswer(): Promise<string> {
    await this.ensurePage()
    await this.page.waitForTimeout(1000)

    const readClipboard = () =>
      this.page.evaluate(async () => {
        return await navigator.clipboard.readText()
      })

    // 复制前先记录剪贴板内容；复制后内容变化才算成功，最多尝试 4 次
    // 下一轮的 before 直接复用上一轮的 after，不再重复读取剪贴板
    let before = await readClipboard()

    for (let attempt = 1; attempt <= COPY_MAX_ATTEMPTS; attempt++) {
      const msg = this.page.locator('.chat-content-item-assistant').last()
      const copyTrigger = msg
        .locator('.segment-assistant-actions .icon-button:has(svg[name="Copy"])')
        .first()
      await copyTrigger.waitFor({ state: 'attached', timeout: 0 })
      await msg.hover()
      await copyTrigger.scrollIntoViewIfNeeded()
      await copyTrigger.click()

      await this.page.waitForTimeout(1000)

      const after = await readClipboard()
      if (after !== before) {
        return after
      }

      console.log(
        `[kimi] 复制回答后剪贴板内容未变化（第 ${attempt}/${COPY_MAX_ATTEMPTS} 次），重试`,
      )
      before = after
    }

    // 超过重试上限：直接返回当前剪贴板内容，避免中断后续流程
    console.warn(`[kimi] 复制回答连续 ${COPY_MAX_ATTEMPTS} 次剪贴板内容未变化，返回当前剪贴板内容`)
    return before
  }

  async getImageAnswer(): Promise<string> {
    // TODO: Kimi 当前不规划生图能力
    throw new Error('KimiAiPageEngine.getImageAnswer 尚未实现')
  }

  private async setModel() {
    await this.ensurePage()
    const trigger = this.page.locator('.current-model')
    await trigger.waitFor({ state: 'visible' })
    await trigger.click()

    const modeItem = this.page.locator('.model-item:has(.name:text-is("快速"))').first()
    await modeItem.waitFor({ state: 'visible' })
    await modeItem.click()
  }

  private async clearFiles(): Promise<void> {
    while (true) {
      const item = this.page.locator('.editor-top-area .carousel-scroll > div').first()
      const exists = await item
        .waitFor({ state: 'visible', timeout: 1000 })
        .then(() => true)
        .catch(() => false)
      if (!exists) break

      await item.hover()
      await this.page.waitForTimeout(300)
      const closeAction = item.locator('.toggle-icon').first()
      await closeAction.waitFor({ state: 'visible' })
      await closeAction.click()
      await this.page.waitForTimeout(300)
    }
  }

  private async clearInput(): Promise<void> {
    const editor = this.page.locator('.chat-input-editor[contenteditable="true"]').first()
    await editor.waitFor({ state: 'visible' })
    await editor.click()

    const selectAll = process.platform === 'darwin' ? 'Meta+A' : 'Control+A'
    await this.page.keyboard.press(selectAll)
    await this.page.keyboard.press('Delete')
    await this.page.waitForTimeout(150)

    const stillHasText = await editor.evaluate(
      (element) => (element.textContent ?? '').trim().length,
    )
    if (stillHasText > 0) {
      await editor.evaluate((element) => {
        element.innerHTML = ''
        element.dispatchEvent(new Event('input', { bubbles: true }))
      })
    }
  }
}
