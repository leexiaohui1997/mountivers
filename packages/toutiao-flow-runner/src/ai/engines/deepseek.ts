import { activatePage } from '../../utils/browser.js'
import { AiPage } from '../types.js'

const DEEPSEEK_URL = 'https://chat.deepseek.com/'
const COPY_MAX_ATTEMPTS = 4

/**
 * DeepSeek 引擎：当前用于书籍内容生成，工作优先级位于元宝和千问之间。
 */
export default class DeepSeekAiPageEngine extends AiPage {
  readonly name = 'deepseek'

  readonly textPriority: number | null = null
  readonly workPriority: number | null = 40
  readonly imagePriority: number | null = null
  readonly watermarkPriority: number | null = null

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
  readonly sessionHosts = ['deepseek.com']

  readonly hasWatermark = false

  async ensureLogin(): Promise<void> {
    await this.ensurePage()
    if (!this.page.url().startsWith(DEEPSEEK_URL)) {
      await this.page.goto(DEEPSEEK_URL)
    }
    await this.page.waitForLoadState('domcontentloaded')

    const avatar = this.page.locator('img[src*="static.deepseek.com/user-avatar"]').first()
    const loginButton = this.page.locator('.ds-button__content:text-is("登录")').first()

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
    console.log('[deepseek] 请完成登录')
    await avatar.waitFor({ state: 'visible', timeout: 0 })
  }

  async openSession(url?: string): Promise<void> {
    await this.ensurePage()
    await activatePage(this.page)
    await this.ensureLogin()

    const target = url && url.startsWith(DEEPSEEK_URL) ? url : DEEPSEEK_URL
    if (this.page.url() !== target) {
      await this.page.goto(target)
    }
    await this.page.waitForLoadState('domcontentloaded', { timeout: 30000 })
  }

  async setImageMode(): Promise<void> {
    // TODO: DeepSeek 当前规划为文本引擎；如果支持生图再实现
    throw new Error('DeepSeekAiPageEngine.setImageMode 尚未实现')
  }

  async clearEditor(): Promise<void> {
    await this.ensurePage()
    await this.clearFiles()
    await this.clearInput()
  }

  async uploadFile(file: File): Promise<void> {
    await this.ensurePage()
    const trigger = this.page.locator('[role="button"]:has(+ input[type="file"])').first()
    await trigger.waitFor({ state: 'visible' })
    const [chooser] = await Promise.all([this.page.waitForEvent('filechooser'), trigger.click()])
    await chooser.setFiles({
      name: file.name,
      mimeType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
    })
  }

  async uploadImage(file: File): Promise<void> {
    // TODO: 上传图片；如果支持图片可复用 uploadFile
    void file
    throw new Error('DeepSeekAiPageEngine.uploadImage 尚未实现')
  }

  async input(text: string): Promise<void> {
    await this.ensurePage()
    const editor = this.page.locator('textarea[name="search"]').first()
    await editor.waitFor({ state: 'visible' })
    await editor.click()
    await editor.fill(text)
    await this.page.waitForTimeout(300)
  }

  async send(): Promise<void> {
    await this.ensurePage()
    const sendButton = this.page
      .locator('[style="width: fit-content;"] > [role="button"]:not(.ds-button--disabled)')
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
      const msg = this.page.locator('[data-virtual-list-item-key]').last()
      const copyTrigger = msg.locator('> .ds-message + .ds-flex > [role="button"]').first()
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
        `[deepseek] 复制回答后剪贴板内容未变化（第 ${attempt}/${COPY_MAX_ATTEMPTS} 次），重试`,
      )
      before = after
    }

    // 超过重试上限：直接返回当前剪贴板内容，避免中断后续流程
    console.warn(
      `[deepseek] 复制回答连续 ${COPY_MAX_ATTEMPTS} 次剪贴板内容未变化，返回当前剪贴板内容`,
    )
    return before
  }

  async getImageAnswer(): Promise<string> {
    // TODO: DeepSeek 当前不规划生图能力
    throw new Error('DeepSeekAiPageEngine.getImageAnswer 尚未实现')
  }

  private async clearFiles(): Promise<void> {
    while (true) {
      const item = this.page.locator('.ds-animated-size-item').first()
      const exists = await item
        .waitFor({ state: 'visible', timeout: 1000 })
        .then(() => true)
        .catch(() => false)
      if (!exists) break

      await item.hover()
      await this.page.waitForTimeout(300)
      const closeAction = item.locator('.ds-icon').first()
      await closeAction.waitFor({ state: 'visible' })
      await closeAction.click()
      await this.page.waitForTimeout(300)
    }
  }

  private async clearInput(): Promise<void> {
    const editor = this.page.locator('textarea[name="search"]').first()
    await editor.waitFor({ state: 'visible' })
    await editor.click()
    await editor.fill('')
  }
}
