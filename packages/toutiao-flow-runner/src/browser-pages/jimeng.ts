import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

import { attachToFile } from '../utils/attach.js'

import type { Locator, Page } from 'playwright'

const JIMENG_HOME_URL = 'https://jimeng.jianying.com/ai-tool/home'
const PROMPT_EDITOR_SELECTOR = '[class^="prompt-editor-"] .tiptap[contenteditable="true"]'
const SUBMIT_SELECTOR = 'button[data-generator-submit-available="true"]:not([disabled]):visible'
const TOOLBAR_COMBOBOX_SELECTOR = '[class*="toolbar-settings-content-"] div[role="combobox"]'
const SETTINGS_BTN_SELECTOR = '[class*="toolbar-settings-content-"] button.lv-btn'
const REFERENCE_GROUP_SELECTOR = '[class*="reference-group-content-"]'
const AVATAR_SELECTOR = '[class^="avatar-action-shell-"]'
const CREDIT_SELECTOR = '[class^="credit-amount-text-"]'

/** 读取即梦页面上的今日剩余积分；找不到返回 null */
export async function readJimengCredit(page: Page): Promise<number | null> {
  const element = page.locator(CREDIT_SELECTOR).first()
  if ((await element.count()) === 0) return null

  const text = (await element.textContent())?.trim()
  if (!text) return null

  const value = Number(text.replace(/[^0-9.]/g, ''))
  return Number.isFinite(value) ? value : null
}

/** 即梦积分不足，调用方应切换到其他引擎 */
export class JimengCreditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'JimengCreditError'
  }
}

export interface JimengGenerateResult {
  /** 出图文件 */
  file: File
  /** 生成前实时读取到的剩余积分（页面未展示时为 null） */
  creditBefore: number | null
  /** 生成完成后实时读取到的剩余积分（页面未展示时为 null） */
  creditAfter: number | null
}

/**
 * 即梦生图引擎（移植老项目 src/commands/jimeng/image.ts）。
 * 只负责“出图并返回 File 与实时积分”，质检与引擎切换在 image-runner 中完成。
 */
export default class JimengPage {
  constructor(public page: Page) {}

  /** 确保已登录即梦（未登录则阻塞等待扫码） */
  async ensureLogin(): Promise<void> {
    await this.page.goto(JIMENG_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await this.page.waitForTimeout(3000)

    const avatar = this.page.locator(AVATAR_SELECTOR).first()
    if ((await avatar.count()) > 0) return

    console.log('[jimeng] 未登录，请在浏览器中完成即梦登录')
    while (true) {
      await this.page.waitForTimeout(2000)
      if ((await avatar.count()) > 0) break
    }
  }

  /** 读取当前页面展示的剩余积分；积分元素在超时内未出现则返回 null */
  async readCredit(timeoutMs = 10000): Promise<number | null> {
    const element = this.page.locator(CREDIT_SELECTOR).first()
    const visible = await element
      .waitFor({ state: 'visible', timeout: timeoutMs })
      .then(() => true)
      .catch(() => false)
    if (!visible) return null

    await this.page.waitForTimeout(300)
    return await readJimengCredit(this.page)
  }

  /**
   * 生成一张图片并返回文件与实时积分。
   * 每次生成都会重新打开首页并重新配置模式/模型/参数，避免状态残留；
   * 提交前会实时读取页面积分并校验，不足时抛 JimengCreditError（不消耗额度）。
   */
  async generate(prompt: string, referencePath?: string | null): Promise<JimengGenerateResult> {
    await this.page.goto(JIMENG_HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await this.page.waitForTimeout(1500)

    const creditBefore = await this.readCredit()
    if (creditBefore !== null && creditBefore <= 0) {
      throw new JimengCreditError(`即梦剩余积分不足：${creditBefore}`)
    }

    const editor = this.page.locator(PROMPT_EDITOR_SELECTOR).first()
    await editor.waitFor({ state: 'visible', timeout: 30000 })
    await this.dismissModals()
    await editor.focus()
    await this.page.waitForTimeout(300)

    await this.openModeSelector()
    await this.selectModel()
    await this.configureImageSettings()

    if (referencePath) {
      await this.uploadReferenceImage(referencePath)
    }

    await this.fillPrompt(prompt)
    await this.clickSubmit()
    await this.waitForGenerationComplete()

    // 生成完成后、打开预览图之前读取积分，避免预览层遮挡积分元素
    const creditAfter = await this.readCredit(5000)

    const src = await this.getLatestGeneratedImageSrc()
    const file = await attachToFile({ type: 'url', path: src, filename: 'image.png' })
    return { file, creditBefore, creditAfter }
  }

  private async fillPrompt(prompt: string): Promise<void> {
    const editor = this.page.locator(PROMPT_EDITOR_SELECTOR).first()
    await editor.focus()
    await this.page.waitForTimeout(200)

    await editor.evaluate((element) => {
      element.innerHTML = ''
      element.dispatchEvent(new InputEvent('input', { bubbles: true }))
    })
    await this.page.waitForTimeout(200)

    await this.page.keyboard.insertText(prompt)
    await this.page.waitForTimeout(500)
  }

  private async clickSubmit(): Promise<void> {
    await this.page.locator(SUBMIT_SELECTOR).first().click({ timeout: 10000 })
  }

  private async waitForGenerationComplete(timeoutMs = 180000): Promise<void> {
    await this.page
      .locator('button[data-generator-submit-available="false"]:visible')
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .catch(() => undefined)

    await this.page
      .locator('button[data-generator-submit-available="true"]:visible')
      .first()
      .waitFor({ state: 'visible', timeout: timeoutMs })
  }

  private async getLatestGeneratedImageSrc(timeoutMs = 60000): Promise<string> {
    const image = this.page
      .locator('[class*="ai-generated-record-content-"] div[data-generated-record-body="inset"]')
      .last()
      .locator('img[data-apm-action="ai-generated-image-record-card"]:not([src=""])')
      .first()
    await image.waitFor({ state: 'visible', timeout: timeoutMs })

    await image.click()
    const previewImage = this.page
      .locator('div[class^="preview-area-"] img[data-apm-action="ai-generated-image-detail-card"]')
      .first()
    await previewImage.waitFor({ state: 'visible', timeout: 10000 })
    await previewImage.click()

    const zoomImage = this.page
      .locator('div[class^="zoom-image-container-"] img[class^="preview-"]')
      .first()
    await zoomImage.waitFor({ state: 'visible', timeout: 10000 })

    const src = await zoomImage.getAttribute('src')
    if (!src) throw new Error('即梦高清图 src 为空')
    return src
  }

  /** 通过 DataTransfer 拖拽上传参考图（即梦无 file input） */
  private async uploadReferenceImage(referencePath: string): Promise<void> {
    const buffer = readFileSync(referencePath)
    const extension = extname(referencePath).toLowerCase()
    const mime =
      extension === '.jpg' || extension === '.jpeg'
        ? 'image/jpeg'
        : extension === '.webp'
          ? 'image/webp'
          : 'image/png'

    await this.page.evaluate(
      async ({ base64, name, type }) => {
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

        const file = new File([bytes], name, { type })
        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(file)

        const target =
          (document.querySelector('[class*="reference-group-content-"]') as HTMLElement | null) ??
          (document.querySelector('[class*="reference-group-"]') as HTMLElement | null)
        if (!target) throw new Error('未找到即梦参考图上传容器')

        const options: DragEventInit = {
          bubbles: true,
          cancelable: true,
          dataTransfer,
        }
        target.dispatchEvent(new DragEvent('dragenter', options))
        target.dispatchEvent(new DragEvent('dragover', options))
        target.dispatchEvent(new DragEvent('drop', options))
      },
      { base64: buffer.toString('base64'), name: `ref${extension}`, type: mime },
    )

    await this.page
      .locator(`${REFERENCE_GROUP_SELECTOR} img[src^="blob:"]`)
      .first()
      .waitFor({ state: 'visible', timeout: 30000 })
    await this.page.waitForTimeout(3000)
  }

  /** 选择创作类型：图片生成 */
  private async openModeSelector(): Promise<void> {
    const trigger = this.page.locator(TOOLBAR_COMBOBOX_SELECTOR).nth(0)
    if ((await trigger.count()) === 0) return

    const label = ((await trigger.textContent().catch(() => '')) ?? '').trim()
    if (!/Agent|创作类型/.test(label)) return

    await trigger.click()
    const option = this.page.locator('li[role="option"]', { hasText: '图片生成' }).first()
    const found = await option
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false)

    if (!found) {
      await this.page.keyboard.press('Escape')
      return
    }

    await option.click()
    await this.page.waitForTimeout(1500)
  }

  /** 选择 Seedream 4.7 模型 */
  private async selectModel(): Promise<void> {
    await this.dismissModals()
    const trigger = this.page
      .locator(
        `${TOOLBAR_COMBOBOX_SELECTOR}:has-text("Seedream"), ${TOOLBAR_COMBOBOX_SELECTOR}:has-text("Dreamina")`,
      )
      .first()
    if ((await trigger.count()) === 0) return

    await trigger.click()
    const option = this.page.locator('li[role="option"]', { hasText: 'Seedream 4.7' }).first()
    const found = await option
      .waitFor({ state: 'visible', timeout: 15000 })
      .then(() => true)
      .catch(() => false)

    if (!found) {
      await this.page.keyboard.press('Escape')
      return
    }

    await option.click()
    await this.page.waitForTimeout(800)
  }

  /** 设置智能画质、2K、数量 1 */
  private async configureImageSettings(): Promise<void> {
    await this.dismissModals()
    const settingsButtons = this.page.locator(SETTINGS_BTN_SELECTOR)
    const settingsCount = await settingsButtons.count()
    if (settingsCount === 0) return

    await settingsButtons.nth(0).click()
    await this.page.waitForTimeout(500)

    const clickIfPresent = async (locator: ReturnType<Page['locator']>): Promise<void> => {
      if ((await locator.count()) === 0) return
      await locator.first().click()
    }

    await clickIfPresent(this.page.locator('label.lv-radio').filter({ hasText: /^智能/ }))
    await clickIfPresent(
      this.page.locator('label.lv-radio', { has: this.page.locator('input[value="2k"]') }),
    )

    // 新 UI：数量设置移到了第二个设置 trigger
    if (settingsCount > 1) {
      const quantityTrigger = settingsButtons.nth(1)
      if (await quantityTrigger.isVisible().catch(() => false)) {
        await quantityTrigger.click().catch(() => undefined)
        await this.page.waitForTimeout(500)
      }
    }

    // 数量：1 —— 只选择当前可见的选项，避免命中另一个隐藏面板里的 radio
    const countOptions = this.page
      .locator('label.lv-radio')
      .filter({ has: this.page.locator('input[value="1"]') })

    let countOption: Locator | null = null
    const countOptionCount = await countOptions.count()
    for (let i = 0; i < countOptionCount; i++) {
      const candidate = countOptions.nth(i)
      if (await candidate.isVisible().catch(() => false)) {
        countOption = candidate
        break
      }
    }

    if (!countOption) {
      throw new Error('即梦设置面板中未找到可见的「数量：1」选项')
    }

    await countOption.click()
    const countInput = countOption.locator('input[value="1"]')
    if (!(await countInput.isChecked().catch(() => false))) {
      await countInput.check({ force: true }).catch(() => undefined)
    }

    const countChecked = await countInput.isChecked().catch(() => false)
    if (!countChecked) {
      throw new Error('即梦「数量：1」设置未生效，已中止本次即梦生成')
    }

    await this.page.waitForTimeout(300)
  }

  /** 关闭可能遮挡工具栏的即梦模态框 */
  private async dismissModals(): Promise<void> {
    const wrappers = this.page.locator('div.lv-modal-wrapper')
    const count = await wrappers.count()

    for (let i = 0; i < count; i++) {
      const wrapper = wrappers.nth(i)
      if (!(await wrapper.isVisible().catch(() => false))) continue

      const closeButton = wrapper.locator(
        'button[class*="close"], .lv-modal-close, [aria-label="close"]',
      )
      if ((await closeButton.count()) > 0) {
        await closeButton
          .first()
          .click({ timeout: 3000 })
          .catch(() => undefined)
      } else {
        await this.page.keyboard.press('Escape').catch(() => undefined)
      }
      await this.page.waitForTimeout(400)
    }

    await this.page
      .evaluate(() => {
        document.querySelectorAll('div.lv-modal-wrapper').forEach((element) => {
          const style = getComputedStyle(element)
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            ;(element as HTMLElement).style.display = 'none'
          }
        })
      })
      .catch(() => undefined)
  }
}
