import ToutiaoPage from '../browser-pages/toutiao.js'
import { browserQueue } from '../utils/browser-queue.js'
import { getPage, releasePage } from '../utils/browser.js'
import BaseRole from '../utils/role/base.js'

const DRAFT_PAGE_ID = 'toutiao-drafts'

/** 每小时清理一次头条草稿箱 */
export default class DeleteDraftsRole extends BaseRole {
  cron = '0 0 * * * ?'
  waitPrevious = true

  async run(): Promise<void> {
    try {
      await browserQueue.run('delete-drafts', async () => {
        const page = await getPage(DRAFT_PAGE_ID)
        try {
          const $page = new ToutiaoPage(page)
          await $page.ensureLogin()
          await $page.openDraftPage()

          const count = await $page.deleteAllDrafts()
          console.log(`[delete-drafts] 清理完成，共删除 ${count} 条草稿`)
        } finally {
          await releasePage(page)
        }
      })
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      console.error(`[delete-drafts] 清理失败: ${reason}`)
    }
  }
}
