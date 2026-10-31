import { Page } from 'playwright'

const TOUTIAO_PUBLISH_URL = 'https://mp.toutiao.com/profile_v4/graphic/publish'
const TOUTIAO_HOME_URL = 'https://mp.toutiao.com/'
const LOGIN_COOKIE_NAMES = ['sessionid', 'sessionid_ss']

export type TopicItem = {
  name: string
  meta: string
}

/** 解析讨论数文本为数值,便于比较热度:"1.6万讨论"→16000,"3讨论"→3,""→0 */
export function parseDiscussionCount(meta: string): number {
  const matched = meta.replace(/,/g, '').match(/([\d.]+)\s*(万|亿)?/)
  if (!matched) return 0
  const num = Number.parseFloat(matched[1])
  const unit = matched[2] === '万' ? 1e4 : matched[2] === '亿' ? 1e8 : 1
  return num * unit
}

/** 头条发布页操作:登录检测、话题收集(参考老项目 collect-topics 逻辑) */
export default class ToutiaoPage {
  constructor(public page: Page) {}

  private async hasLoginCookie(): Promise<boolean> {
    const cookies = await this.page.context().cookies()
    return cookies.some((c) => LOGIN_COOKIE_NAMES.includes(c.name) && c.value.length > 0)
  }

  /** 未登录则打日志并阻塞等待扫码 */
  async ensureLogin() {
    if (await this.hasLoginCookie()) return

    console.log('[toutiao] 未登录，请在浏览器中完成扫码登录')
    await this.page.goto(TOUTIAO_HOME_URL, { waitUntil: 'domcontentloaded' })
    while (!(await this.hasLoginCookie())) {
      await this.page.waitForTimeout(2000)
    }
    console.log('[toutiao] 已完成登录')
  }

  /** 隐藏头条发布页上可能拦截点击/遮挡的弹窗、抽屉、遮罩 */
  private async hideMasks() {
    await this.page.evaluate(() => {
      const selectors = [
        '.ai-assistant-drawer',
        '.byte-drawer-mask',
        '.byte-modal-wrapper',
        '.byte-modal-mask',
        '.byte-mask',
        '.byte-drawer',
        '.byte-popup',
        "[class*='byte-modal']",
        "[class*='byte-drawer']",
        "[class*='byte-mask']",
      ]
      selectors.forEach((s) => {
        document.querySelectorAll(s).forEach((el) => {
          ;(el as HTMLElement).style.display = 'none'
        })
      })
    })
  }

  /** 打开发布页并隐藏可能拦截点击的弹窗/遮罩 */
  async openPublishPage() {
    await this.page.bringToFront()
    await this.page.goto(TOUTIAO_PUBLISH_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    })
    await this.page.waitForTimeout(1000)
    await this.hideMasks()
  }

  /** 正文编辑器聚焦(优先带"正文"占位的 ProseMirror) */
  private async focusEditor() {
    const bodyEditor = this.page.locator(
      ".ProseMirror[data-placeholder*='正文'], .ProseMirror[aria-placeholder*='正文'], .ProseMirror:has-text('请输入正文')",
    )
    const target =
      (await bodyEditor.count()) > 0 ? bodyEditor.first() : this.page.locator('.ProseMirror').last()
    await target.click({ timeout: 15000 })
    await this.page.waitForTimeout(500)
    await this.page.evaluate(() => {
      const p = document.querySelector('.ProseMirror')
      if (p) (p as HTMLElement).focus()
    })
  }

  /**
   * 输入 #关键词 触发话题推荐,只取讨论数最高的那一个话题。
   * 必须逐字 type,insertText 不触发 # 的话题监听。
   * 收集完成后 reload 重置编辑器,供下一次收集使用(首轮页面由 openPublishPage 保证干净)。
   */
  async collectTopics(keyword: string): Promise<TopicItem[]> {
    await this.focusEditor()
    // 必须逐字 type,insertText 不触发 # 的话题监听
    await this.page.keyboard.type(`#${keyword}`, { delay: 80 })
    await this.page.waitForTimeout(1000)

    const items: TopicItem[] = await this.page.evaluate(() => {
      return (
        Array.from(document.querySelectorAll('.forum-list-item'))
          .map((el) => {
            const name = el.querySelector('.forum-list-item-text')?.textContent?.trim() || ''
            const meta = el.querySelector('div:nth-child(2)')?.textContent?.trim() || ''
            return { name, meta }
          })
          // 过滤骨架/占位项(话题名为空)
          .filter((item) => item.name.length > 0)
      )
    })

    // 收集完成后刷新重置,下一轮输入不受本轮残留干扰
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 })
    await this.page.waitForTimeout(300)
    await this.hideMasks()

    if (!items.length) return []
    const best = items.reduce((a, b) =>
      parseDiscussionCount(a.meta) >= parseDiscussionCount(b.meta) ? a : b,
    )
    return [best]
  }
}
