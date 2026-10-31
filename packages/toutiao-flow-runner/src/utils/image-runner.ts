import { AiPageAdapter } from '../ai/adapter.js'
import JimengAiPageEngine, { JimengCreditError } from '../ai/engines/jimeng.js'
import QianwenAiPageEngine from '../ai/engines/qianwen.js'
import WenxinAiPageEngine from '../ai/engines/wenxin.js'
import YuanbaoAiPageEngine from '../ai/engines/yuanbao.js'
import { getImageEngine } from '../ai/helper.js'
import { checkImage } from '../ai/logics/check-image.js'
import { fixImagePrompt } from '../ai/logics/fix-image-prompt.js'
import { generateImage } from '../ai/logics/generate-image.js'
import { removeWatermark } from '../ai/logics/remove-watermark.js'

import { attachToFile, saveFile } from './attach.js'
import { prisma } from './db.js'
import {
  consumeJimengCredit,
  markJimengCreditExhausted,
  setJimengCreditState,
} from './jimeng-credit.js'

import type { Ai, AiPage } from '../ai/types.js'
import type { PrismaClient } from '@toutiao-flow/db'

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

type ImageEngineName = 'jimeng' | 'yuanbao'

/** 持有当前图片引擎，并处理即梦 → 元宝的切换 */
class ImageAiManager {
  private engine: AiPage
  private ai: Ai
  private name: ImageEngineName

  constructor(engine: AiPage) {
    this.engine = engine
    this.ai = new AiPageAdapter(engine)
    this.name = engine instanceof JimengAiPageEngine ? 'jimeng' : 'yuanbao'
  }

  get current(): Ai {
    return this.ai
  }

  get engineName(): ImageEngineName {
    return this.name
  }

  async switchToYuanbao(): Promise<void> {
    if (this.name === 'yuanbao') return

    await this.ai.release()
    this.engine = new YuanbaoAiPageEngine()
    this.ai = new AiPageAdapter(this.engine)
    this.name = 'yuanbao'
  }

  /** 即梦成功后刷新积分；若已用完，立即切到元宝供后续任务使用 */
  async refreshJimengCredit(): Promise<void> {
    if (!(this.engine instanceof JimengAiPageEngine)) return

    const credit = this.engine.lastCreditAfter
    if (credit === null) {
      await consumeJimengCredit()
      return
    }

    console.log(`[image] 即梦实时剩余积分：${credit}`)
    await setJimengCreditState(credit)

    if (credit <= 0) {
      await markJimengCreditExhausted(0)
      console.log('[image] 即梦积分已用完，后续改用元宝')
      await this.switchToYuanbao()
    }
  }

  async release(): Promise<void> {
    await this.ai.release()
  }
}

/**
 * 串行执行一批图片任务。
 * 调用方必须已处于 browserQueue 任务内；engine 自己管理页面生命周期。
 */
export async function runImageTasks(tasks: ImageTask[]): Promise<ImageTaskResult[]> {
  if (!tasks.length) return []

  const results: ImageTaskResult[] = []
  const manager = new ImageAiManager(await getImageEngine())
  const checkAi = new AiPageAdapter(new QianwenAiPageEngine())

  let wenxinAi: Ai | null = null
  let fixAi: Ai | null = null

  const ensureWenxinAi = (): Ai => {
    if (!wenxinAi) {
      wenxinAi = new AiPageAdapter(new WenxinAiPageEngine())
    }
    return wenxinAi
  }

  const ensureFixAi = (): Ai => {
    if (!fixAi) {
      fixAi = new AiPageAdapter(new YuanbaoAiPageEngine())
    }
    return fixAi
  }

  const generate = async (prompt: string, reference?: File): Promise<File> => {
    const actualPrompt = manager.engineName === 'yuanbao' ? emphasizeRatio(prompt) : prompt
    return await generateImage(manager.current, { prompt: actualPrompt, reference })
  }

  try {
    for (const task of tasks) {
      const attachPath = task.attachPath?.()
      const reference = attachPath
        ? await attachToFile({ type: 'file', path: attachPath })
        : undefined

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
        let engineUsed: ImageEngineName = manager.engineName

        try {
          generated = await generate(prompt, reference)
          engineUsed = manager.engineName
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error)

          if (manager.engineName === 'jimeng') {
            const creditError = error instanceof JimengCreditError || isJimengCreditError(detail)
            console.log(
              `[image] ${task.label} ${creditError ? '即梦积分不足' : '即梦生成失败'}，切换到元宝: ${detail}`,
            )
            if (creditError) {
              await markJimengCreditExhausted()
            }
            await manager.switchToYuanbao()

            try {
              generated = await generate(prompt, reference)
              engineUsed = 'yuanbao'
            } catch (fallbackError) {
              const fixed = await tryFixPrompt(ensureFixAi(), task, prompt, fallbackError, tryTimes)
              if (fixed) prompt = fixed
              continue
            }
          } else {
            const fixed = await tryFixPrompt(ensureFixAi(), task, prompt, error, tryTimes)
            if (fixed) prompt = fixed
            continue
          }
        }

        if (engineUsed === 'jimeng') {
          await manager.refreshJimengCredit()
        }

        // 即梦与元宝出图后统一走文心去水印
        try {
          generated = await removeWatermark(ensureWenxinAi(), { image: generated })
        } catch (error) {
          console.log(
            `[image] ${task.label} 第 ${tryTimes} 次去水印失败: ${error instanceof Error ? error.message : String(error)}`,
          )
          continue
        }

        const check = await checkImage(checkAi, { image: generated, prompt })
        const brief = check.checks
          .map((c) =>
            c.pass ? `${c.name}✓${c.reason ? `(${c.reason})` : ''}` : `${c.name}✗(${c.reason})`,
          )
          .join(' ')
        console.log(
          `[image] ${task.label} 第 ${tryTimes} 次校验结果(engine=${engineUsed}, pass=${check.pass}, score=${check.score}): ${brief}`,
        )

        if (!best || check.score > best.score) {
          best = { score: check.score, file: generated }
        }

        if (check.pass) {
          passed = true
          outputPath = task.outputPath()
          await saveFile(generated, outputPath)
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
    await manager.release()
    await checkAi.release()
    if (wenxinAi) await wenxinAi.release()
    if (fixAi) await fixAi.release()
  }
}

/** 元宝出图失败时改写提示词；失败只记录，不阻塞后续尝试 */
async function tryFixPrompt(
  ai: Ai,
  task: ImageTask,
  prompt: string,
  error: unknown,
  tryTimes: number,
): Promise<string | null> {
  const detail = error instanceof Error ? error.message : String(error)
  console.log(`[image] ${task.label} 第 ${tryTimes} 次元宝出图失败，按提示词违规处理: ${detail}`)

  try {
    const fixed = await fixImagePrompt(ai, {
      prompt,
      sessionUrl: task.sessionUrl?.() ?? undefined,
    })
    await task.onPromptFixed?.(fixed)
    console.log(`[image] ${task.label} 提示词已改写，重跑该任务`)
    return fixed
  } catch (fixError) {
    console.error(
      `[image] ${task.label} 修词失败: ${fixError instanceof Error ? fixError.message : String(fixError)}`,
    )
    return null
  }
}

/** 判断即梦错误是否属于积分不足 */
function isJimengCreditError(message: string): boolean {
  return ['积分不足', '积分不够', '积分已用完', '积分用完'].some((keyword) =>
    message.includes(keyword),
  )
}
