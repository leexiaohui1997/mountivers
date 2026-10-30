import { mkdirSync } from 'fs'

import { BrowserContext, chromium, Page } from 'playwright'

import {
  BROWSER_DATA_DIR,
  BROWSER_HEADLESS,
  BROWSER_VIEWPORT_HEIGHT,
  BROWSER_VIEWPORT_WIDTH,
} from './env.js'

let context: BrowserContext | undefined
const pagesCache = new Map<Page, string>()

export async function getContext() {
  if (!context) {
    mkdirSync(BROWSER_DATA_DIR, { recursive: true })
    context = await chromium.launchPersistentContext(BROWSER_DATA_DIR, {
      headless: BROWSER_HEADLESS,
      acceptDownloads: true,
      viewport: { width: BROWSER_VIEWPORT_WIDTH, height: BROWSER_VIEWPORT_HEIGHT },
      args: ['--disable-blink-features=AutomationControlled'],
      permissions: ['clipboard-read'],
    })
  }
  return context
}

export async function getPage(id: string) {
  for (const [page, pageId] of pagesCache.entries()) {
    if (id === pageId) {
      return page
    }
  }

  const ctx = await getContext()
  const pages = ctx.pages()
  const page = pages.find((item) => !pagesCache.has(item)) || (await ctx.newPage())
  pagesCache.set(page, id)
  return page
}

export async function releasePage(page: Page) {
  pagesCache.delete(page)
}
