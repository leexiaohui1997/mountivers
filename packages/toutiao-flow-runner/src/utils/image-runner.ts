import JimengPage from '../browser-pages/jimeng.js'
import WenxinPage from '../browser-pages/wenxin.js'
import YuanBaoPage from '../browser-pages/yuanbao.js'
import { isCheckJson, type CheckJson } from '../types/check.js'
import { isFixPromptJson } from '../types/fix-prompt.js'

import { attachToFile, saveFile } from './attach.js'
import { activatePage, getPage, releasePage } from './browser.js'
import { prisma } from './db.js'
import {
  consumeJimengCredit,
  getJimengCreditState,
  markJimengCreditExhausted,
  setJimengCreditState,
} from './jimeng-credit.js'
import { extractJsonBlock } from './markdown.js'
import { renderTemplate } from './template.js'

import type { PrismaClient } from '@toutiao-flow/db'
import type { Page } from 'playwright'

/** 单张图片的生成任务：出图 → 去水印 → 质检，失败时用 suggestion 重跑 */
export interface ImageTask {
  /** 日志与结果定位用的名称，如 cover / illustration-1 */
  label: string
  prompt: () => string
  /** 成功后的落盘绝对路径 */
  outputPath: () => string
  /** 参考图路径（可选） */
  attachPath?: () => string | null
  /** 提示词违规时，修词 AI 使用的会话地址 */
  sessionUrl?: () => string | null
  /** 提示词被改写后回调（通常用于回写数据库） */
  onPromptFixed?: (fixedPrompt: string) => Promise<void>
  onResult?: (filePath: string, tx: PrismaClient) => Promise<void>
  onFail?: () => Promise<void>
}

export interface ImageTaskResult {
  label: string
  passed: boolean
  filePath?: string
}

/**
 * 生图前把提示词中的画幅比例加粗（2054x1600 / 16:9），
 * 降低模型忽略比例、按默认方图出图的概率。
 * 已加粗的比例不会重复处理。
 */
export function emphasizeRatio(prompt: string): string {
  return prompt
    .replace(/(?<!\*)(2054\s*[x×X]\s*1600)(?!\*)/g, '**$1**')
    .replace(/(?<!\*)(16\s*[:：]\s*9)(?!\*)/g, '**$1**')
}

/**
 * 串行执行一批图片任务。
 * 浏览器页面由本函数统一初始化/释放，调用方必须已处于 browserQueue 任务内。
 */
export async function runImageTasks(tasks: ImageTask[]): Promise<ImageTaskResult[]> {
  if (!tasks.length) return []

  const results: ImageTaskResult[] = []
  const checkPage = await getPage('yuanbao-check-image')
  // 元宝 / 文心页面惰性获取：只有确定走元宝引擎时才打开
  let yuanbaoPage: Page | null = null
  let wenxinPage: Page | null = null
  // 修词页面惰性创建,只在出图失败时才建会话
  let fixPage: Page | null = null
  // 即梦页面惰性创建，积分不可用时完全不打开
  let jimengPage: Page | null = null
  let $jimeng: JimengPage | null = null

  let useJimeng = true
  const initialCreditState = await getJimengCreditState()
  if (initialCreditState && initialCreditState.remainingCredit <= 0) {
    useJimeng = false
    console.log('[image] 即梦积分状态为 0，本次直接使用元宝')
  }

  try {
    let $yuanbaoPage: YuanBaoPage | null = null
    const $checkPage = new YuanBaoPage(checkPage)
    await $checkPage.newSession()
    let $wenxinPage: WenxinPage | null = null
    let $fixPage: YuanBaoPage | null = null

    for (const task of tasks) {
      let prompt = task.prompt()
      let outputPath = ''
      let passed = false
      let tryTimes = 0
      /** 本次任务所有已出图结果中评分最高的一张，用于全部失败时兜底 */
      let best: { score: number; file: File } | null = null

      // 单任务闭环:出图 → 去水印 → 校验;校验不通过采用 suggestion 重跑,最多 3 次
      // 3 次都未通过时，取评分最高的结果落盘
      while (tryTimes < 3 && !passed) {
        tryTimes++

        let generated: File | null = null
        let engineUsed: 'jimeng' | 'yuanbao' | null = null

        // 优先即梦；积分不足 / 不可用时回退元宝
        if (useJimeng) {
          try {
            if (!$jimeng) {
              jimengPage = await getPage('gen-img-jimeng')
              $jimeng = new JimengPage(jimengPage)
              await $jimeng.ensureLogin()

              const credit = await $jimeng.readCredit()
              if (credit !== null) {
                console.log(`[image] 即梦剩余积分：${credit}`)
                if (credit <= 0) {
                  await markJimengCreditExhausted(0)
                  useJimeng = false
                } else {
                  await setJimengCreditState(credit)
                }
              }
            }
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            console.log(`[image] 即梦初始化失败，切换到元宝: ${detail}`)
            useJimeng = false
          }
        }

        if (useJimeng && $jimeng) {
          try {
            await activatePage(jimengPage!)
            console.log(`[image] ${task.label} 第 ${tryTimes} 次使用即梦生成`)
            generated = await $jimeng.generate(prompt, task.attachPath?.())
            engineUsed = 'jimeng'
            await consumeJimengCredit()
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            console.log(`[image] ${task.label} 即梦生成失败，切换到元宝: ${detail}`)
            if (isJimengCreditError(detail)) {
              await markJimengCreditExhausted()
            }
            useJimeng = false
            generated = null
          }
        }

        if (!generated) {
          // 元宝出图：确定回退元宝后才打开元宝页面
          if (!yuanbaoPage || !$yuanbaoPage) {
            yuanbaoPage = await getPage('gen-img-yuanbao')
            $yuanbaoPage = new YuanBaoPage(yuanbaoPage)
          }
          // 每次出图都开新会话，避免前序图片/提示词影响本次结果
          await activatePage(yuanbaoPage)
          await $yuanbaoPage.newSession()
          await $yuanbaoPage.setImageMode()
          await $yuanbaoPage.clearEditor()
          const attachPath = task.attachPath?.()
          if (attachPath) {
            const file = await attachToFile({ type: 'file', path: attachPath })
            await $yuanbaoPage.uploadImage(file)
          }
          await $yuanbaoPage.input(emphasizeRatio(prompt))
          await $yuanbaoPage.send()

          let src = ''
          try {
            src = await $yuanbaoPage.getImageAnswer()
          } catch (e) {
            const detail = e instanceof Error ? e.message : String(e)
            console.log(
              `[image] ${task.label} 第 ${tryTimes} 次元宝出图失败，按提示词违规处理: ${detail}`,
            )

            // 调起修词 AI，改写提示词后回写并重跑
            try {
              if (!fixPage) {
                fixPage = await getPage('fix-prompt-yuanbao')
                $fixPage = new YuanBaoPage(fixPage)
              }
              const fixed = await fixPrompt($fixPage!, prompt, task.sessionUrl?.())
              if (fixed) {
                prompt = fixed
                await task.onPromptFixed?.(fixed)
                console.log(`[image] ${task.label} 提示词已改写，重跑该任务`)
              }
            } catch (fixErr) {
              console.error(
                `[image] ${task.label} 修词失败: ${fixErr instanceof Error ? fixErr.message : String(fixErr)}`,
              )
            }
            continue
          }

          // 文心去水印：确定走元宝后才获取文心页面
          if (!$wenxinPage) {
            wenxinPage = await getPage('gen-img-yuanbao-wenxin')
            $wenxinPage = new WenxinPage(wenxinPage)
            await $wenxinPage.newSession()
          }
          const yuanbaoImage = await attachToFile({ type: 'url', path: src, filename: 'image.png' })
          let wenxinResult = ''
          try {
            wenxinResult = await removeWaterMark($wenxinPage, yuanbaoImage)
          } catch (e) {
            console.log(
              `[image] ${task.label} 第 ${tryTimes} 次去水印失败: ${(e as Error).message}`,
            )
            continue
          }

          generated = await attachToFile({
            type: 'url',
            path: wenxinResult,
            filename: 'image.png',
          })
          engineUsed = 'yuanbao'
        }

        if (!generated) {
          console.error(`[image] ${task.label} 未生成图片，跳过本次尝试`)
          continue
        }

        const file = generated
        const check = await checkImage($checkPage, file, prompt)
        const brief = check.checks
          .map((c) =>
            c.pass ? `${c.name}✓${c.reason ? `(${c.reason})` : ''}` : `${c.name}✗(${c.reason})`,
          )
          .join(' ')
        console.log(
          `[image] ${task.label} 第 ${tryTimes} 次校验结果(engine=${engineUsed ?? 'unknown'}, pass=${check.pass}, score=${check.score}): ${brief}`,
        )

        if (!best || check.score > best.score) {
          best = { score: check.score, file }
        }

        if (check.pass) {
          passed = true
          outputPath = task.outputPath()
          await saveFile(file, outputPath)
          break
        }

        // 不通过:校验返回的 suggestion 即调整后的完整提示词，直接用它重跑
        const suggestion = check.suggestion.trim()
        if (suggestion) {
          prompt = suggestion
          console.log(`[image] ${task.label} 采用校验返回的最终提示词重跑: ${suggestion}`)
        }
      }

      // 多次质检均未通过：采用评分最高的一张，避免整批结果被丢弃
      if (!passed && best) {
        outputPath = task.outputPath()
        await saveFile(best.file, outputPath)
        passed = true
        console.warn(
          `[image] ${task.label} ${tryTimes} 次质检均未通过，采用最高分 ${best.score} 的结果: ${outputPath}`,
        )
      }

      if (passed) {
        await task.onResult?.(outputPath, prisma)
        results.push({ label: task.label, passed: true, filePath: outputPath })
      } else {
        console.error(`[image] ${task.label} 重试 3 次仍未通过，放弃该任务: ${prompt}`)
        await task.onFail?.()
        results.push({ label: task.label, passed: false })
      }
    }

    return results
  } finally {
    if (yuanbaoPage) await releasePage(yuanbaoPage)
    if (wenxinPage) await releasePage(wenxinPage)
    await releasePage(checkPage)
    if (fixPage) await releasePage(fixPage)
    if (jimengPage) await releasePage(jimengPage)
  }
}

/** 判断即梦错误是否属于积分不足 */
function isJimengCreditError(message: string): boolean {
  return ['积分不足', '积分不够', '积分已用完', '积分用完'].some((keyword) =>
    message.includes(keyword),
  )
}

/**
 * 违规提示词改写:让 AI 改写规避违规表述，返回改写后的提示词文本。
 * 格式不合法时纠正重发，持续重试直到拿到合法 JSON(不设重试上限)，
 * 因此调用期间会一直占用 browserQueue 的槽位。
 */
async function fixPrompt(
  $fixPage: YuanBaoPage,
  prompt: string,
  sessionUrl?: string | null,
): Promise<string> {
  await $fixPage.newSession(sessionUrl ?? undefined)
  await $fixPage.clearEditor()
  await $fixPage.input(await renderTemplate('fix-prompt.prompt', { prompt }))
  await $fixPage.send()

  while (true) {
    const answer = await $fixPage.getAnswer()
    const json = extractJsonBlock(answer)
    if (!json) {
      await $fixPage.clearEditor()
      await $fixPage.input('请以 json 代码块的格式回复')
      await $fixPage.send()
      continue
    }

    let failReason = ''
    if (isFixPromptJson(json, (reason) => (failReason = reason))) {
      return json.prompt
    }

    await $fixPage.clearEditor()
    await $fixPage.input(`json 格式错误，请调整：${failReason}`)
    await $fixPage.send()
  }
}

/** 图片质量校验:上传图片 + 渲染后的校验提示词,循环直至拿到合法 check.json */
async function checkImage($checkPage: YuanBaoPage, file: File, prompt: string): Promise<CheckJson> {
  await $checkPage.newSession()
  await $checkPage.clearEditor()
  await $checkPage.uploadFile(file, true)
  await $checkPage.input(await renderTemplate('image-check.prompt', { prompt }))
  await $checkPage.send()

  while (true) {
    const answer = await $checkPage.getAnswer()
    const json = extractJsonBlock(answer)
    if (!json) {
      await $checkPage.clearEditor()
      await $checkPage.input(
        '针对上一轮图片质量检查的回复：回复里没有找到可解析的 JSON 代码块。请沿用上一轮已经完成的检查结论进行调整，只重新输出一个完整的 JSON 代码块，不要重复检查图片、不要输出解释或其他文字。',
      )
      await $checkPage.send()
      continue
    }

    let failReason = ''
    if (isCheckJson(json, (reason) => (failReason = reason))) {
      return json
    }

    await $checkPage.clearEditor()
    await $checkPage.input(
      `针对上一轮图片质量检查的回复：JSON 格式不符合要求。请沿用上一轮已经完成的检查结论，修正以下问题后重新输出：\n${failReason}\n只输出一个完整的 JSON 代码块，不要重复检查图片、不要输出解释或其他文字。`,
    )
    await $checkPage.send()
  }
}

/** 文心一言去水印:粘贴图片 + "去水印"发送,最多重试 3 次,返回去水印后图片 URL */
async function removeWaterMark($wenxinPage: WenxinPage, image: File): Promise<string> {
  await activatePage($wenxinPage.page)

  let reTryTimes = 0
  while (reTryTimes < 3) {
    await $wenxinPage.pasteImage(image)
    await $wenxinPage.input('去水印')
    await $wenxinPage.send()
    try {
      return await $wenxinPage.getImageAnswer()
    } catch {
      reTryTimes++
    }
  }

  throw new Error('文心一言去水印失败(重试 3 次)')
}
