import { BookStatus, Prisma } from '@toutiao-flow/db'

import ToutiaoPage, { parseDiscussionCount, type TopicItem } from '../browser-pages/toutiao.js'
import YuanBaoPage from '../browser-pages/yuanbao.js'
import { isTopicKeywordsJson } from '../types/topic-keywords.js'
import { browserQueue } from '../utils/browser-queue.js'
import { getPage, releasePage } from '../utils/browser.js'
import { prisma } from '../utils/db.js'
import { extractJsonBlock } from '../utils/markdown.js'
import BaseRole from '../utils/role/base.js'
import { renderTemplate } from '../utils/template.js'

/** 话题数量达标线:不足则回到 AI 重新提炼关键词 */
const TOPIC_TARGET = 3

/** 话题热度门槛:讨论数不足 1000 的话题直接丢弃 */
const TOPIC_MIN_DISCUSSION = 1000

export default class TopicCollectRole extends BaseRole {
  cron = '* * * * * *'
  waitPrevious = true

  async run(): Promise<void> {
    const book = await prisma.book.findFirst({
      where: {
        status: BookStatus.PROCESSING,
        tags: { equals: Prisma.DbNull },
        overview: { not: Prisma.DbNull },
      },
      orderBy: { createdAt: 'asc' },
    })
    if (!book) return

    console.log(`[topic-collect] 开始收集话题: book.id=${book.id}`)

    // 浏览器是共享单例：整段页面流程作为一个任务串行执行
    await browserQueue.run(`topic-collect:${book.id}`, async () => {
      const yuanbaoPage = await getPage('topic-keywords-yuanbao')
      const toutiaoPage = await getPage('topic-collect-toutiao')
      try {
        const $toutiao = new ToutiaoPage(toutiaoPage)
        await $toutiao.ensureLogin()

        const topics: TopicItem[] = []
        const excludeKeywords = new Set<string>()
        let round = 0

        // AI 给关键词 → 头条收集 → 不足 3 个回到 AI 重新给,直到达标或轮次耗尽
        while (topics.length < TOPIC_TARGET && round < 5) {
          round++

          const keywords = await this.getKeywords(new YuanBaoPage(yuanbaoPage), book.sessionUrl, [
            ...excludeKeywords,
          ])
          if (!keywords.length) {
            console.log(`[topic-collect] 第 ${round} 轮未拿到关键词，放弃本轮`)
            break
          }
          console.log(`[topic-collect] 第 ${round} 轮关键词: ${keywords.join('、')}`)

          // 每轮重新进入发布页,保证编辑器就位
          await $toutiao.openPublishPage()
          const collected: TopicItem[] = []
          for (const kw of keywords) {
            try {
              const items = await $toutiao.collectTopics(kw)
              // 热度门槛:讨论数不足 1000 的话题丢弃
              const valid = items.filter(
                (item) => parseDiscussionCount(item.meta) >= TOPIC_MIN_DISCUSSION,
              )
              console.log(
                `[topic-collect] #${kw} ${items.length ? `收集到「${items[0].name}」(${items[0].meta})` : '未收集到话题'}${valid.length ? '' : '，低于门槛丢弃'}`,
              )
              // AI 给过的关键词一律排除,下轮不再重复
              excludeKeywords.add(kw)
              collected.push(...valid)
            } catch (e) {
              console.log(
                `[topic-collect] #${kw} 收集失败，跳过: ${e instanceof Error ? e.message : String(e)}`,
              )
            }
          }

          // 按 name 去重合并
          const seen = new Set(topics.map((t) => t.name))
          for (const item of collected) {
            if (!seen.has(item.name)) {
              seen.add(item.name)
              topics.push(item)
            }
          }
          console.log(`[topic-collect] 第 ${round} 轮累计话题数: ${topics.length}`)
        }

        if (topics.length >= TOPIC_TARGET) {
          // 按讨论数从高到低排序后落库
          topics.sort((a, b) => parseDiscussionCount(b.meta) - parseDiscussionCount(a.meta))
          await prisma.book.update({
            where: { id: book.id },
            data: { tags: topics },
          })
          console.log(`[topic-collect] 话题已落库: book.id=${book.id}, 共 ${topics.length} 个`)
        } else {
          console.log(
            `[topic-collect] 话题数不足 ${TOPIC_TARGET}(当前 ${topics.length}),下轮重试: book.id=${book.id}`,
          )
        }
      } finally {
        await releasePage(yuanbaoPage)
        await releasePage(toutiaoPage)
      }
    })
  }

  /**
   * AI 提炼搜索关键词(复用 Book 的元宝会话):格式不合法时纠正重发,
   * 持续重试直到拿到合法 JSON,不会返回空数组。
   * 注意:本方法不设重试上限,调用期间会一直占用 browserQueue 的槽位。
   */
  async getKeywords(
    $yuanbao: YuanBaoPage,
    sessionUrl?: string | null,
    exclude: string[] = [],
  ): Promise<string[]> {
    await $yuanbao.newSession(sessionUrl ?? undefined)
    await $yuanbao.clearEditor()
    await $yuanbao.input(await renderTemplate('topic-keywords.prompt', { exclude }))
    await $yuanbao.send()

    while (true) {
      const answer = await $yuanbao.getAnswer()
      const json = extractJsonBlock(answer)
      if (!json) {
        await $yuanbao.clearEditor()
        await $yuanbao.input('请以 json 代码块的格式回复')
        await $yuanbao.send()
        continue
      }

      let failReason = ''
      if (isTopicKeywordsJson(json, (reason) => (failReason = reason))) {
        return json.keywords
      }

      await $yuanbao.clearEditor()
      await $yuanbao.input(`json 格式错误，请调整：${failReason}`)
      await $yuanbao.send()
    }
  }
}
