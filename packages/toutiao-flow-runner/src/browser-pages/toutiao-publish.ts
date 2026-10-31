import { resolve } from 'node:path'

import { activatePage } from '../utils/browser.js'

import { hideToutiaoMasks } from './toutiao.js'

import type { Page } from 'playwright'

const TOUTIAO_PUBLISH_URL = 'https://mp.toutiao.com/profile_v4/graphic/publish'
const TOUTIAO_MANAGE_URL = 'https://mp.toutiao.com/profile_v4/manage/content/all'
const TOUTIAO_COLLECTION_LIST_URL = 'https://mp.toutiao.com/profile_v4/graphic/collections'

/** 等待合集从审核中变为已发布的最长时间 */
const COLLECTION_WAIT_TIMEOUT_MS = 10 * 60 * 1000
/** 合集等待后的最大重试次数 */
const MAX_COLLECTION_WAIT_RETRIES = 2

export type PublishBlock =
  | { type: 'title'; content: string }
  | { type: 'text'; content: string }
  | { type: 'image'; content: string }

export interface PublishArticleInput {
  title: string
  coverPath: string
  collectionName: string
  content: PublishBlock[]
  tags: string[]
}

/** 今日发文已达上限 */
export class PublishLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PublishLimitError'
  }
}

/** 合集不可选（未发布 / 今日合集已达上限 / 找不到） */
export class CollectionUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CollectionUnavailableError'
  }
}

/** 合集存在但当前不可选（通常是审核中） */
export class CollectionLockedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CollectionLockedError'
  }
}

/** 今日头条图文发布页操作 */
export default class ToutiaoPublishPage {
  constructor(public page: Page) {}

  /** 作品管理页是否已存在同标题的文章（用于防止重复发布） */
  async hasPublishedArticle(title: string): Promise<boolean> {
    await this.page.goto(TOUTIAO_MANAGE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await this.page.waitForTimeout(3000)
    return await this.page
      .getByText(title, { exact: false })
      .first()
      .isVisible()
      .catch(() => false)
  }

  /** 填充并发布一篇成稿 */
  async publishArticle(input: PublishArticleInput): Promise<void> {
    let collectionWaits = 0

    while (true) {
      // openPublishPage 内已完成限额检查（在清理遮罩之前）
      await this.openPublishPage()

      if (input.collectionName) {
        try {
          await this.selectCollection(input.collectionName)
        } catch (error) {
          if (error instanceof CollectionLockedError) {
            if (collectionWaits >= MAX_COLLECTION_WAIT_RETRIES) {
              throw new CollectionUnavailableError(
                `合集「${input.collectionName}」持续不可选，等待重试次数已用完`,
              )
            }
            collectionWaits++
            await this.waitUntilCollectionPublished(input.collectionName)
            continue
          }
          throw error
        }
      }

      await this.fillTitle(input.title)
      await this.uploadCover(input.coverPath)
      await this.fillArticle(input.content)

      if (input.tags.length > 0) {
        const lastIsImage = input.content[input.content.length - 1]?.type === 'image'
        await this.fillTags(input.tags, lastIsImage)
      }

      await this.cancelMiniToutiao()
      await this.publish(input.title)
      return
    }
  }

  private async openPublishPage(): Promise<void> {
    await activatePage(this.page)
    await this.page.goto(TOUTIAO_PUBLISH_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await this.page.waitForTimeout(2000)
    // 限额弹窗必须在清理抽屉/遮罩之前读取，避免被清理逻辑遮挡而漏判
    await this.ensureNoPublishLimit()
    await this.dismissAiAssistant()
    await hideToutiaoMasks(this.page, { hideModals: false })
  }

  /** 检查「无法发布」弹窗，命中则抛 PublishLimitError */
  private async ensureNoPublishLimit(): Promise<void> {
    const modal = this.page.locator('.byte-modal-title:has-text("无法发布")').first()
    if (!(await modal.isVisible().catch(() => false))) return

    const content =
      (await this.page
        .locator('.byte-modal-content')
        .first()
        .textContent()
        .catch(() => '')) || ''
    throw new PublishLimitError(content.trim() || '今日发文已达上限')
  }

  private async selectCollection(name: string): Promise<void> {
    await this.page.locator('button:has-text("添加至合集")').click()
    await this.page.waitForTimeout(1000)

    const item = this.page.locator('.add-collection-item').filter({ hasText: name }).first()
    try {
      await item.waitFor({ state: 'visible', timeout: 8000 })
    } catch {
      await this.page.keyboard.press('Escape')
      throw new CollectionUnavailableError(`找不到可选的合集「${name}」`)
    }

    const className = (await item.getAttribute('class')) || ''
    if (className.includes('disabled')) {
      await this.page.keyboard.press('Escape')
      throw new CollectionLockedError(`合集「${name}」当前不可选（今日已达上限或未发布）`)
    }

    await item.click()
    await this.page.waitForTimeout(500)
    await this.page
      .locator('.byte-modal-footer button:has-text("确定"), .byte-modal button:has-text("确定")')
      .last()
      .click()
    await this.page.waitForTimeout(800)
  }

  /** 轮询合集列表，等目标合集变为「已发布」后继续（审核中场景） */
  private async waitUntilCollectionPublished(
    name: string,
    timeoutMs = COLLECTION_WAIT_TIMEOUT_MS,
  ): Promise<void> {
    console.log(`[toutiao-publish] 合集《${name}》暂不可选，等待审核发布…`)
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      await this.page.goto(TOUTIAO_COLLECTION_LIST_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 30000,
      })
      await this.page.waitForTimeout(1500)

      const published = this.page
        .locator('.collection-card-item')
        .filter({ hasText: name })
        .filter({ hasText: '已发布' })
        .first()

      if (await published.isVisible().catch(() => false)) {
        console.log(`[toutiao-publish] 合集《${name}》已发布，重新打开发布页`)
        return
      }

      await this.page.waitForTimeout(2000)
    }

    throw new CollectionUnavailableError(`等待合集《${name}》发布超时`)
  }

  private async fillTitle(title: string): Promise<void> {
    await this.page.locator('textarea[placeholder*="请输入文章标题"]').fill(title)
  }

  private async uploadCover(coverPath: string): Promise<void> {
    const singleRadio = this.page.locator('input[type="radio"][value="2"]')
    if (!(await singleRadio.isChecked().catch(() => false))) {
      await this.page.locator('label.byte-radio:has-text("单图")').click()
      await this.page.waitForTimeout(300)
    }

    await this.page.locator('.article-cover-add').click()
    await this.page.waitForTimeout(1000)
    await this.page.locator('.byte-tabs-header-title', { hasText: '上传图片' }).click()
    await this.page.waitForTimeout(500)

    const [fileChooser] = await Promise.all([
      this.page.waitForEvent('filechooser', { timeout: 10000 }),
      this.page.locator('button:has-text("本地上传")').click(),
    ])
    await fileChooser.setFiles(resolve(coverPath))

    await this.page.locator('text=/已上传.*张图片/').waitFor({ state: 'visible', timeout: 30000 })
    await this.page.waitForTimeout(500)
    await this.page.getByRole('button', { name: '确定' }).click()
    await this.page.waitForTimeout(1000)
  }

  private async fillArticle(blocks: PublishBlock[]): Promise<void> {
    const editor = this.page.locator('.ProseMirror').first()
    await editor.click()
    await this.page.waitForTimeout(300)

    let prevType: PublishBlock['type'] | null = null
    for (const block of blocks) {
      if (prevType !== null && prevType !== 'image') {
        await this.page.keyboard.press('Enter')
        await this.page.waitForTimeout(150)
      }

      if (block.type === 'title') {
        await this.typeH1Heading(block.content)
      } else if (block.type === 'text') {
        await this.page.keyboard.insertText(block.content)
      } else {
        await this.insertImage(block.content)
      }
      prevType = block.type
    }
  }

  private async typeH1Heading(text: string): Promise<void> {
    await this.page.locator('.syl-toolbar-button').nth(4).click()
    await this.page.waitForTimeout(250)
    await this.page.keyboard.insertText(text)
    await this.page.waitForTimeout(150)
  }

  private async insertImage(imagePath: string): Promise<void> {
    const imageCountBefore = await this.page.locator('.ProseMirror img').count()

    const imageButton = this.page
      .locator(
        'button[title*="图"], [aria-label*="图"], [class*="toolbar"] [class*="image"], [class*="toolbar"] [class*="Image"]',
      )
      .first()
    await imageButton.click()
    await this.page.waitForTimeout(1000)

    const fileInput = this.page.locator('input[type="file"][accept*="image"]').first()
    await fileInput.waitFor({ state: 'attached', timeout: 10000 })
    await fileInput.setInputFiles(resolve(imagePath))

    await this.page.locator('text=/已上传.*张图片/').waitFor({ state: 'visible', timeout: 30000 })
    await this.page.getByRole('button', { name: '确定' }).click()

    await this.page.waitForFunction(
      (previous) => document.querySelectorAll('.ProseMirror img').length > previous,
      imageCountBefore,
      { timeout: 30000 },
    )
    await this.page.waitForTimeout(300)
  }

  private async fillTags(tags: string[], lastBlockIsImage: boolean): Promise<void> {
    if (tags.length === 0) return
    if (!lastBlockIsImage) {
      await this.page.keyboard.press('Enter')
      await this.page.waitForTimeout(150)
    }

    const normalized = tags.map((tag) => `#${tag.replace(/^#+/, '').replace(/#+$/, '')}#`)
    await this.page.keyboard.insertText(normalized.join(' '))
    await this.page.waitForTimeout(300)
  }

  /** 取消勾选「发布得更多收益」 */
  private async cancelMiniToutiao(): Promise<void> {
    const checkbox = this.page.locator("label.byte-checkbox:has-text('发布得更多收益')").first()
    if ((await checkbox.count()) === 0) return
    if (!(await checkbox.isVisible().catch(() => false))) return

    const className = (await checkbox.getAttribute('class')) || ''
    if (className.includes('byte-checkbox-checked')) {
      await checkbox.click()
      await this.page.waitForTimeout(500)
    }
  }

  private async publish(title: string): Promise<void> {
    await this.dismissAiAssistant()
    await hideToutiaoMasks(this.page, { hideModals: false })

    await this.page.locator('button:has-text("预览并发布")').last().click()
    await this.page.waitForTimeout(2500)

    const confirmButton = this.page.locator('button:has-text("确认发布")').last()
    await confirmButton.waitFor({ state: 'visible', timeout: 25000 })
    await this.dismissAiAssistant()
    await hideToutiaoMasks(this.page, { hideModals: false })
    await confirmButton.click()
    await this.page.waitForTimeout(5000)

    await this.page.goto(TOUTIAO_MANAGE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await this.page.waitForTimeout(3000)
    await this.page
      .getByText(title, { exact: false })
      .first()
      .waitFor({ state: 'visible', timeout: 15000 })
    console.log(`[toutiao-publish] 作品管理页已确认：《${title}》`)
  }

  /** 关闭头条 AI 创作助手抽屉（会遮挡发布按钮） */
  private async dismissAiAssistant(): Promise<void> {
    const drawer = this.page.locator('.ai-assistant-drawer').first()
    const mask = this.page.locator('.byte-drawer-mask').first()

    const isOpen = async () =>
      (await mask.isVisible().catch(() => false)) ||
      ((await drawer.count()) > 0 && (await drawer.isVisible().catch(() => false)))

    if (!(await isOpen())) return

    const closeButton = drawer
      .locator(
        "svg.close-btn, .byte-drawer-header [class*='close'], .byte-drawer-header [aria-label*='关闭'], .byte-drawer-header [aria-label*='关 闭']",
      )
      .first()
    if ((await closeButton.count()) > 0 && (await closeButton.isVisible().catch(() => false))) {
      await closeButton.click().catch(() => undefined)
      await this.page.waitForTimeout(500)
    }

    if (await isOpen()) {
      await hideToutiaoMasks(this.page, { hideModals: false })
    }
  }
}
