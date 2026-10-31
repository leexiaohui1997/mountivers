import path from 'node:path'

import { Book, BookStatus } from '@toutiao-flow/db'
import { Page } from 'playwright'

import YuanBaoPage from '../browser-pages/yuanbao.js'
import { isOverviewJson, OverviewJson } from '../types/overview.js'
import { attachToFile } from '../utils/attach.js'
import { browserQueue } from '../utils/browser-queue.js'
import { getPage, releasePage } from '../utils/browser.js'
import { prisma } from '../utils/db.js'
import { extractJsonBlock } from '../utils/markdown.js'
import BaseRole from '../utils/role/base.js'
import { renderToAttach } from '../utils/template.js'

export default class BookOverview extends BaseRole {
  cron = '* * * * * ?'
  waitPrevious = true

  async run(): Promise<void> {
    const book = await prisma.book.findFirst({
      where: {
        status: BookStatus.READY,
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    if (!book) {
      return
    }

    // 浏览器是共享单例：整段页面流程作为一个任务串行执行
    await browserQueue.run(`book-overview:${book.id}`, async () => {
      const page = await getPage(book.id)
      try {
        await this.generateOverview(page, book)
      } finally {
        await releasePage(page)
      }
    })
  }

  async generateOverview(page: Page, book: Book) {
    const ext = path.extname(book.path)
    let data: OverviewJson | null = null

    console.log(`[book-overview] 开始生成概览: ${book.path} (book.id=${book.id}, ext=${ext})`)

    if (['.pdf'].includes(ext)) {
      data = await this.generateOverviewYuanbao(page, book)
    }

    if (!data) {
      console.log(`[book-overview] 未生成概览(无可用生成器或不支持的文件类型): ${book.path}`)
      return
    }

    await prisma.$transaction(async (tx) => {
      await tx.book.update({
        where: { id: book.id },
        data: {
          overview: data,
          sessionUrl: page.url(),
          status: BookStatus.PROCESSING,
        },
      })

      // 已存在则保留（可能已生成成稿/图片），避免重复占位
      for (const item of data.articlePlan) {
        await tx.article.upsert({
          where: { bookId_index: { bookId: book.id, index: item.no } },
          update: {},
          create: { index: item.no, bookId: book.id },
        })
      }
    })

    console.log(
      `[book-overview] 概览已生成: 《${data.bookTitle}》 (book.id=${book.id}) → ${BookStatus.PROCESSING}`,
    )
  }

  async generateOverviewYuanbao(page: Page, book: Book): Promise<OverviewJson> {
    const $page = new YuanBaoPage(page)
    await $page.newSession()
    await $page.clearEditor()
    const bookFile = await attachToFile({ type: 'file', path: book.path })
    const promptFile = await renderToAttach('overview.prompt', '书籍概览编写提示词.md')
    await $page.uploadFile(bookFile)
    await $page.uploadFile(promptFile)
    await $page.input('按提示词为这本书编写概览 overview，以 json 代码块的格式回复')
    await $page.send()

    let data: OverviewJson

    while (true) {
      const answer = await $page.getAnswer()
      const overviewJson = extractJsonBlock(answer)
      if (!overviewJson) {
        await $page.clearEditor()
        await $page.input('请以 json 代码块的格式回复')
        await $page.send()
        continue
      }

      let failReason = ''
      const check = isOverviewJson(overviewJson, (reason) => (failReason = reason))
      if (!check) {
        await $page.clearEditor()
        await $page.input(`概览校验未通过，请调整后重新输出完整 overview JSON：${failReason}`)
        await $page.send()
        continue
      }

      data = overviewJson
      break
    }

    return data
  }
}
