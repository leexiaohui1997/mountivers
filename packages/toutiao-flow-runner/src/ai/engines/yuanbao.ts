import { activatePage } from '../../utils/browser.js'
import { AiPage } from '../types.js'

const YUANBAO_URL = 'https://yuanbao.tencent.com/'
const NEW_SESSION_URL = `${YUANBAO_URL}chat/naQivTmsDa`
const COPY_MAX_ATTEMPTS = 4

/**
 * 元宝引擎：直接基于 Playwright Page 实现 AiPage。
 */
export default class YuanbaoAiPageEngine extends AiPage {
  async ensureLogin(): Promise<void> {
    await this.ensurePage()
    const url = this.page.url()
    if (!url.startsWith(YUANBAO_URL)) {
      await this.page.goto(YUANBAO_URL)
    }
    await this.page.waitForLoadState('domcontentloaded')

    while (true) {
      const avatarImg = this.page.locator('.yb-common-nav__ft__avatar .image-container img').first()
      await avatarImg.waitFor({ state: 'visible' })
      const avatarSrc = await avatarImg.getAttribute('src')

      if (avatarSrc && avatarSrc.includes('avatar.yuanbao.tencent.com')) {
        break
      }

      await avatarImg.dispatchEvent('click')
      await this.page.waitForTimeout(300)
      const loginContent = this.page.locator('.hyc-login__content').first()
      await loginContent.waitFor({ state: 'visible' })
      console.log('[元宝] 请扫码完成登录')
      await Promise.race([
        loginContent.waitFor({ state: 'hidden', timeout: 0 }),
        loginContent.waitFor({ state: 'detached', timeout: 0 }),
      ])
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
  }

  async openSession(url?: string): Promise<void> {
    await this.ensurePage()
    await activatePage(this.page)
    await this.ensureLogin()
    const target = url && url.startsWith(YUANBAO_URL) ? url : NEW_SESSION_URL
    if (this.page.url() !== target) {
      await this.page.goto(target)
    }
    await this.page.waitForLoadState('domcontentloaded')
  }

  async uploadFile(file: File): Promise<void> {
    await this.ensurePage()
    const addToolsAction = this.page
      .locator('[data-new-input-card] [data-new-input-control="add-tools"]')
      .first()
    await addToolsAction.waitFor({ state: 'visible' })
    await addToolsAction.click()
    await this.page.waitForTimeout(300)
    // 图片作为 text2text 附件时走「上传图片」，普通文档走「本地文件」
    const menuText = file.type.startsWith('image/') ? '上传图片' : '本地文件'
    const trigger = this.page.locator(`button[role="menuitem"]:has-text("${menuText}")`).first()
    await trigger.waitFor({ state: 'visible' })
    const [chooser] = await Promise.all([this.page.waitForEvent('filechooser'), trigger.click()])
    await chooser.setFiles({
      name: file.name,
      mimeType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
    })
  }

  async uploadImage(file: File): Promise<void> {
    await this.ensurePage()
    const trigger = this.page.locator('[data-new-input-card] button[aria-label="上传图片"]').first()
    await trigger.waitFor({ state: 'visible' })
    const [chooser] = await Promise.all([this.page.waitForEvent('filechooser'), trigger.click()])
    await chooser.setFiles({
      name: file.name,
      mimeType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
    })
  }

  async clearEditor(): Promise<void> {
    await this.ensurePage()
    await this.clearFiles()
    await this.clearInput()
  }

  async input(text: string): Promise<void> {
    await this.ensurePage()
    const editor = this.page.locator('.ql-editor[contenteditable="true"]').first()
    await editor.waitFor({ state: 'visible' })
    await editor.click()
    await this.page.keyboard.insertText(text)
    await this.page.waitForTimeout(300)
  }

  async send(): Promise<void> {
    await this.ensurePage()
    const sendButton = this.page
      .locator('#yuanbao-send-btn:not([class*="SendButton_sendNot"])')
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
      const copyTrigger = this.page.locator(
        '.agent-chat__list__item--last [class^="ToolbarCopy_arrowIconWrap"]',
      )
      await copyTrigger.waitFor({ state: 'attached', timeout: 0 })
      await copyTrigger.scrollIntoViewIfNeeded()
      await copyTrigger.click()

      const copyButton = this.page.locator('.t-dropdown__item:has-text("复制为Markdown")').first()
      await copyButton.waitFor({ state: 'visible' })
      await copyButton.click()

      await this.page
        .locator('.t-message__list:has-text("回答复制成功")')
        .first()
        .waitFor({ state: 'visible', timeout: 10000 })
      await this.page.waitForTimeout(1000)

      const after = await readClipboard()
      if (after !== before) {
        return after
      }

      console.log(
        `[元宝] 复制回答后剪贴板内容未变化（第 ${attempt}/${COPY_MAX_ATTEMPTS} 次），重试`,
      )
      before = after
    }

    // 超过重试上限：直接返回当前剪贴板内容，避免中断后续流程
    console.warn(`[元宝] 复制回答连续 ${COPY_MAX_ATTEMPTS} 次剪贴板内容未变化，返回当前剪贴板内容`)
    return before
  }

  async getImageAnswer(): Promise<string> {
    await this.ensurePage()
    const image = this.page
      .locator('.agent-chat__list__content .agent-chat__list__item[data-conv-speaker="ai"]')
      .last()
      .locator('img.dic-card-item__img--loaded')
      .first()
    const failHint = this.page
      .locator('.hyc-content-loading__text:has-text("图片生成失败")')
      .first()

    await Promise.race([
      image.waitFor({ state: 'visible', timeout: 0 }),
      failHint.waitFor({ state: 'visible', timeout: 0 }),
    ])

    if (await failHint.isVisible().catch(() => false)) {
      const text = (await failHint.textContent().catch(() => '')) || ''
      throw new Error(text.trim())
    }

    const url = await image.getAttribute('data-download-url')
    if (!url) throw new Error('最新出图卡片 data-download-url 为空')
    return url
  }

  /** 切换到 AI 生图模式；text2Image 适配会用到 */
  async setImageMode(): Promise<void> {
    await this.ensurePage()
    const actions = this.page.locator('div[data-new-input-control="atomic-actions"]').first()
    await actions.waitFor({ state: 'visible' })

    let directButton = actions.locator('button[aria-label="AI 生图"]')
    for (let i = 0; i < 3 && (await directButton.count()) === 0; i++) {
      await this.page.waitForTimeout(2000)
      directButton = actions.locator('button[aria-label="AI 生图"]')
    }

    if ((await directButton.count()) > 0) {
      await directButton.first().click()
      await this.page.waitForTimeout(500)
      return
    }

    const toolButton = actions.locator('button[aria-label="工具"]').first()
    try {
      await toolButton.click({ timeout: 10000 })
    } catch {
      console.log('[元宝] 工具按钮点击失败，刷新页面重试…')
      await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
      const retryActions = this.page.locator('div[data-new-input-control="atomic-actions"]').first()
      await retryActions.waitFor({ state: 'visible', timeout: 15000 })
      await this.page.waitForTimeout(2000)
      await retryActions.locator('button[aria-label="工具"]').first().click({ timeout: 15000 })
    }

    const menuItem = this.page.locator('button[role="menuitem"][aria-label="AI 生图"]').first()
    try {
      await menuItem.waitFor({ state: 'visible', timeout: 5000 })
    } catch {
      throw new Error('工具菜单中未找到 AI 生图入口，请检查元宝页面或账号是否具备生图能力')
    }
    await menuItem.click()
    await this.page.waitForTimeout(500)
  }

  private async clearFiles(): Promise<void> {
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

  private async clearInput(): Promise<void> {
    const editor = this.page.locator('.ql-editor[contenteditable="true"]').first()
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
