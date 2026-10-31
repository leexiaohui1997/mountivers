import { mkdirSync } from 'fs'

import { BrowserContext, chromium, Page } from 'playwright'

import {
  BROWSER_DATA_DIR,
  BROWSER_HEADLESS,
  BROWSER_VIEWPORT_HEIGHT,
  BROWSER_VIEWPORT_WIDTH,
} from './env.js'

let context: BrowserContext | undefined
let launching: Promise<BrowserContext> | undefined
const pagesCache = new Map<Page, string>()
const pendingPages = new Map<string, Promise<Page>>()

export async function getContext(): Promise<BrowserContext> {
  if (context) return context

  // 并发首次调用共用同一个启动 Promise，避免重复启动 Chromium、争用同一 profile
  if (!launching) {
    launching = (async () => {
      mkdirSync(BROWSER_DATA_DIR, { recursive: true })
      context = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
        headless: BROWSER_HEADLESS,
        acceptDownloads: true,
        viewport: { width: BROWSER_VIEWPORT_WIDTH, height: BROWSER_VIEWPORT_HEIGHT },
        args: ['--disable-blink-features=AutomationControlled'],
        permissions: ['clipboard-read'],
      })
      return context
    })().finally(() => {
      launching = undefined
    })
  }
  return launching
}

export async function getPage(id: string): Promise<Page> {
  for (const [page, pageId] of pagesCache) {
    if (id === pageId) {
      return page
    }
  }

  // 同一 id 的并发首次调用复用同一个创建 Promise，避免各自 newPage 后互相覆盖缓存
  const pending = pendingPages.get(id)
  if (pending) {
    return pending
  }

  const creating = (async () => {
    const ctx = await getContext()
    const pages = ctx.pages()
    const page = pages.find((item) => !pagesCache.has(item)) || (await ctx.newPage())
    pagesCache.set(page, id)
    return page
  })()

  pendingPages.set(id, creating)
  try {
    return await creating
  } finally {
    pendingPages.delete(id)
  }
}

export async function releasePage(page: Page) {
  // 无论关闭/重置成功与否都要清掉缓存，避免页面崩溃或已被用户关闭时残留脏条目
  try {
    if (page.context().pages().length > 1) {
      await page.close()
    } else {
      await page.goto('about:blank', { waitUntil: 'domcontentloaded' })
    }
  } finally {
    pagesCache.delete(page)
  }
}

/**
 * 统一的页面激活入口。
 * 当前保持 page.bringToFront()；后续如需改成“不抬窗口”的焦点模拟，只改这里。
 */
export async function activatePage(page: Page): Promise<void> {
  await page.bringToFront()
}
