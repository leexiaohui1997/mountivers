import { browserQueue } from '../../utils/browser-queue.js'
import { waitForLong } from '../../utils/browser-wait.js'
import { handleDragVerification, VerificationPassedError } from '../../utils/drag-verification.js'
import { isEngineLimited, markEngineLimited } from '../../utils/engine-limit.js'
import { CreditLimitError } from '../error.js'

import DoubaoTextAiPageEngine, { DOUBAO_CAPTCHA_SELECTORS } from './doubao-text.js'

/** 豆包额度恢复间隔：1 天 */
export const DOUBAO_CREDIT_RECOVERY_MS = 24 * 60 * 60 * 1000

export class DoubaoCreditLimitError extends CreditLimitError {
  constructor(message = '豆包创作额度已用尽', retryAfterMs = DOUBAO_CREDIT_RECOVERY_MS) {
    super(message, retryAfterMs)
    this.name = 'DoubaoCreditLimitError'
  }
}

/**
 * 豆包生图引擎：继承文本引擎复用登录和文本页面操作，只负责生图。
 */
export default class DoubaoAiPageEngine extends DoubaoTextAiPageEngine {
  readonly name = 'doubao'
  readonly textPriority = null
  readonly workPriority = null
  readonly imagePriority = null

  async setImageMode(): Promise<void> {
    await this.ensurePage()
    // 切换图像模式
    const switchButton = this.page.locator('[data-testid="skill_bar_button_3"]').first()
    await switchButton.waitFor({ state: 'visible' })
    await switchButton.click()

    // 选择模型
    const modelButton = this.page
      .locator('[data-input-engine-actionbar-control-key="model"]')
      .first()
    await modelButton.waitFor({ state: 'visible' })
    await modelButton.click()
    const modelTarget = this.page.locator('[role="menuitem"]:has-text("Seedream 4.0")').first()
    await modelTarget.waitFor({ state: 'visible' })
    await modelTarget.click()

    // 设置比例
    const paramAction = this.page
      .locator('[data-input-engine-actionbar-render-entry-key="image-generation-params-panel"]')
      .first()
    await paramAction.waitFor({ state: 'visible' })
    await paramAction.click()
    const paramTarget = this.page
      .locator('[data-radix-menu-content] button:has-text("自动")')
      .first()
    await paramTarget.waitFor({ state: 'visible' })
    await paramTarget.click()

    // 收起弹层
    await paramAction.click()
    await this.page.waitForTimeout(300)
  }

  async uploadImage(file: File): Promise<void> {
    await this.ensurePage()
    const trigger = this.page.locator('button:has(+ [data-testid="upload-file-input"])').first()
    await trigger.waitFor({ state: 'visible' })
    const [chooser] = await Promise.all([this.page.waitForEvent('filechooser'), trigger.click()])
    await chooser.setFiles({
      name: file.name,
      mimeType: file.type,
      buffer: Buffer.from(await file.arrayBuffer()),
    })
  }

  async getImageAnswer(): Promise<string> {
    await this.ensurePage()

    const controller = new AbortController()

    try {
      return await Promise.race([
        this.readImageAnswer(),
        handleDragVerification({
          ...DOUBAO_CAPTCHA_SELECTORS,
          page: this.page,
          engineName: this.name,
          signal: controller.signal,
          acquireHold: () => browserQueue.hold(),
        }).then<string>(() => {
          throw new VerificationPassedError()
        }),
      ])
    } finally {
      controller.abort()
    }
  }

  private async readImageAnswer(): Promise<string> {
    await this.ensurePage()
    const image = this.page
      .locator('.v_list_row [data-testid="receive_message"]')
      .last()
      .locator('img[class^="image"]')
      .first()
    await image.waitFor({ state: 'visible', timeout: 600000 })
    const url = await image.getAttribute('src')
    if (!url) throw new Error('最新出图卡片 src 为空')
    return url
  }

  async disabled(): Promise<boolean> {
    return isEngineLimited('doubao')
  }

  async checkCreditLimit(): Promise<void> {
    await this.ensurePage()
    const target = this.page
      .locator('.v_list_row button .truncate:text-is("购买创作额度包")')
      .first()
    await waitForLong(target, { state: 'attached', label: 'doubao.credit-limit' })

    const creditError = new DoubaoCreditLimitError()
    const recoveryMs = creditError.retryAfterMs ?? DOUBAO_CREDIT_RECOVERY_MS
    const now = new Date()
    const until = new Date(now.getTime() + recoveryMs)

    try {
      await markEngineLimited('doubao', {
        reason: 'credit-exhausted',
        until,
        metadata: {
          blockedAt: now.toISOString(),
          recoveryMs,
        },
      })
      console.warn(`[doubao] 检测到额度限制，预计恢复时间: ${until.toISOString()}`)
    } catch (error) {
      // 状态写入失败不应掩盖额度限制本身
      console.error(
        `[doubao] 记录额度状态失败: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    throw creditError
  }
}
