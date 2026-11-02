import { waitForLong } from '../../utils/browser-wait.js'
import { activatePage } from '../../utils/browser.js'
import { AiPage } from '../types.js'

const DOUBAO_URL = 'https://www.doubao.com/'
const COPY_MAX_ATTEMPTS = 4

/**
 * 豆包文本引擎：只负责文字生成和附件上传。
 * 生图及豆包生图额度限制由 DoubaoAiPageEngine 负责。
 */
export default class DoubaoTextAiPageEngine extends AiPage {
  readonly name: string = 'doubao-text'
  readonly textPriority: number | null = 10
  readonly workPriority: number | null = 20
  readonly imagePriority: number | null = null
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
  readonly sessionHosts = ['doubao.com']

  readonly hasWatermark = false

  async ensureLogin(): Promise<void> {
    await this.ensurePage()
    const url = this.page.url()
    if (!url.startsWith(DOUBAO_URL)) {
      await this.page.goto(DOUBAO_URL)
    }
    await this.page.waitForLoadState('domcontentloaded')

    const avatarImg = this.page.locator('[data-testid="chat_header_avatar_button"]').first()
    const loginButton = this.page.locator('[data-testid="to_login_button"]').first()
    const { hasAvatarImg = false, hasLoginButton = false } = await Promise.race<{
      hasAvatarImg?: boolean
      hasLoginButton?: boolean
    }>([
      (async () => ({
        hasAvatarImg: await avatarImg
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

    if (hasAvatarImg) return
    if (hasLoginButton) {
      await loginButton.click()
    }
    console.log('[豆包] 请完成登录')
    await waitForLong(avatarImg, { state: 'visible', label: 'doubao.login-avatar' })
  }

  async openSession(url?: string): Promise<void> {
    await this.ensurePage()
    await activatePage(this.page)
    await this.ensureLogin()
    const target = url && url.startsWith(DOUBAO_URL) ? url : DOUBAO_URL
    if (this.page.url() !== target) {
      await this.page.goto(target)
    }
    await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 })
  }

  async clearEditor(): Promise<void> {
    await this.ensurePage()
    await this.clearFiles()
    await this.clearInput()
  }

  async uploadFile(file: File): Promise<void> {
    await this.ensurePage()
    const addToolsAction = this.page.locator('[data-testid="upload_file_button"]').first()
    await addToolsAction.waitFor({ state: 'visible' })
    await addToolsAction.click()
    await this.page.waitForTimeout(300)
    const trigger = this.page.locator('[role="option"]:has-text("上传文件或图片")').first()
    await trigger.waitFor({ state: 'visible' })
    const [chooser] = await Promise.all([this.page.waitForEvent('filechooser'), trigger.click()])
    await chooser.setFiles({
      name: file.name,
      mimeType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
    })
  }

  async input(text: string): Promise<void> {
    await this.ensurePage()
    const editor = this.page.locator('.tiptap[contenteditable="true"]').first()
    await editor.waitFor({ state: 'visible' })
    await editor.click()
    await this.page.keyboard.insertText(text)
    await this.page.waitForTimeout(300)
  }

  async send(): Promise<void> {
    await this.ensurePage()
    const sendButton = this.page
      .locator('[data-testid="chat_input_send_button"][data-disabled="false"]')
      .first()
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
      const msg = this.page.locator('.v_list_row [data-testid="receive_message"]').last()
      const copyTrigger = msg.locator('[data-testid="message_action_copy"]').first()
      await waitForLong(copyTrigger, { state: 'attached', label: 'doubao.copy-button' })
      await msg.hover()
      await copyTrigger.scrollIntoViewIfNeeded()
      await copyTrigger.click()

      await this.page.waitForTimeout(1000)

      const after = await readClipboard()
      if (after !== before) {
        return after
      }

      console.log(
        `[豆包] 复制回答后剪贴板内容未变化（第 ${attempt}/${COPY_MAX_ATTEMPTS} 次），重试`,
      )
      before = after
    }

    // 超过重试上限：直接返回当前剪贴板内容，避免中断后续流程
    console.warn(`[豆包] 复制回答连续 ${COPY_MAX_ATTEMPTS} 次剪贴板内容未变化，返回当前剪贴板内容`)
    return before
  }

  async setImageMode(): Promise<void> {
    throw new Error('DoubaoTextAiPageEngine 不支持生图')
  }

  async uploadImage(file: File): Promise<void> {
    void file
    throw new Error('DoubaoTextAiPageEngine 不支持上传图片')
  }

  async getImageAnswer(): Promise<string> {
    throw new Error('DoubaoTextAiPageEngine 不支持读取图片')
  }

  private async clearFiles(): Promise<void> {
    while (true) {
      const item = this.page
        .locator('[data-testid="carousel-item"] div[data-testid^="attachment"]')
        .first()
      const exists = await item
        .waitFor({ state: 'visible', timeout: 1000 })
        .then(() => true)
        .catch(() => false)
      if (!exists) break

      await item.hover()
      await this.page.waitForTimeout(300)
      const closeAction = item.locator('svg[data-testid*="delete"]').first()
      await closeAction.waitFor({ state: 'visible' })
      await closeAction.click()
      await this.page.waitForTimeout(300)
    }
  }

  private async clearInput(): Promise<void> {
    const editor = this.page.locator('.tiptap[contenteditable="true"]').first()
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
