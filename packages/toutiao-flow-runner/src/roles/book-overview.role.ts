import path from 'node:path'

import { Book, BookStatus } from '@toutiao-flow/db'

import YuanBaoPage from '../browser-pages/yuanbao.js'
import { attachToFile } from '../utils/attach.js'
import { getPage } from '../utils/browser.js'
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

    await this.generateOverview(book)
  }

  async generateOverview(book: Book) {
    const ext = path.extname(book.path)
    if (['.pdf'].includes(ext)) {
      await this.generateOverviewYuanbao(book)
      return
    }
  }

  async generateOverviewYuanbao(book: Book) {
    const page = await getPage(book.id)
    const $page = new YuanBaoPage(page)
    await $page.newSession()
    await $page.clearEditor()
    const bookFile = await attachToFile({ type: 'file', path: book.path })
    const promptFile = await renderToAttach('overview.prompt', '书籍概览编写提示词.md')
    await $page.uploadFile(bookFile)
    await $page.uploadFile(promptFile)
    await $page.input('按提示词为这本书编写概览 overview，以 json 代码块的格式回复')
    await $page.send()
    const answer = await $page.getAnswer()
    const overviewJson = extractJsonBlock(answer)
    console.log('回复：')
    console.log(overviewJson)
    await new Promise((r) => setTimeout(r, 1500000))
  }
}
