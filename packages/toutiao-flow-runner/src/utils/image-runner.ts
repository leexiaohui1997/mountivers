import { AiPageAdapter } from '../ai/adapter.js'
import JimengAiPageEngine, { JimengCreditError } from '../ai/engines/jimeng.js'
import { CreditLimitError } from '../ai/error.js'
import { pickEngine } from '../ai/helper.js'
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
import { incrementPublishStatField } from './publish-stat.js'

import type { Ai, AiPage } from '../ai/types.js'
import type { CheckJson } from '../types/check.js'
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

/** 单次出图后，因水印维度不通过而执行“去水印 → 图检”的最大轮数 */
const MAX_WATERMARK_CLEAN_ROUNDS = 3

/** 持有当前图片引擎，并在失败或额度受限时按优先级切换到下一个 */
class ImageAiManager {
  private engine: AiPage
  private ai: Ai
  private readonly excluded = new Set<string>()

  constructor(engine: AiPage) {
    this.engine = engine
    this.ai = new AiPageAdapter(engine)
  }

  get current(): Ai {
    return this.ai
  }

  get engineName(): string {
    return this.engine.name
  }

  get hasWatermark(): boolean {
    return this.engine.hasWatermark
  }

  /** 切换到下一个可用生图引擎；没有可用引擎时返回 false */
  async switchToNextEngine(): Promise<boolean> {
    const next = await pickEngine({
      capability: 'image',
      exclude: [...this.excluded, this.engine.name],
    })
    if (!next) return false

    this.excluded.add(this.engine.name)
    await this.ai.release()
    this.engine = next
    this.ai = new AiPageAdapter(next)
    return true
  }

  /** 即梦成功后刷新积分；若已用完，标记并切到下一个引擎供后续任务使用 */
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
      console.log('[image] 即梦积分已用完，后续改用其他引擎')
      try {
        await this.switchToNextEngine()
      } catch (error) {
        console.log(
          `[image] 切换生图引擎失败: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
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

  const imageEngine = await pickEngine({ capability: 'image' })
  if (!imageEngine) throw new Error('没有可用的生图引擎')

  const checkEngine = await pickEngine({ capability: 'text' })
  if (!checkEngine) throw new Error('没有可用的图片质检引擎')

  const results: ImageTaskResult[] = []
  const manager = new ImageAiManager(imageEngine)
  const checkAi = new AiPageAdapter(checkEngine)

  let watermarkAi: Ai | null = null
  let fixAi: Ai | null = null
  let fixAiSession: string | null = null

  const ensureWatermarkAi = async (): Promise<Ai> => {
    if (!watermarkAi) {
      const engine = await pickEngine({ capability: 'watermark' })
      if (!engine) throw new Error('没有可用的去水印引擎')
      watermarkAi = new AiPageAdapter(engine)
    }
    return watermarkAi
  }

  const ensureFixAi = async (sessionUrl?: string): Promise<Ai> => {
    const target = sessionUrl ?? null
    if (!fixAi || fixAiSession !== target) {
      if (fixAi) await fixAi.release()

      const engine = await pickEngine({ capability: 'text', sessionUrl })
      if (!engine) throw new Error('没有可用的修词引擎')

      fixAi = new AiPageAdapter(engine)
      fixAiSession = target
    }
    return fixAi
  }

  const generate = async (prompt: string, reference?: File): Promise<File> => {
    const actualPrompt = manager.engineName === 'yuanbao' ? emphasizeRatio(prompt) : prompt
    return await generateImage(manager.current, { prompt: actualPrompt, reference })
  }

  /** 图检若指出水印维度不通过，则去水印后重新图检，最多 3 轮 */
  const checkAndCleanWatermark = async (
    image: File,
    prompt: string,
    label: string,
    attempt: number,
  ): Promise<{ file: File; check: CheckJson }> => {
    let file = image
    let check = await checkImage(checkAi, { image: file, prompt })

    for (let round = 1; round <= MAX_WATERMARK_CLEAN_ROUNDS && check.hasWatermark; round++) {
      console.log(`[image] ${label} 第 ${attempt} 次校验水印未通过，执行第 ${round} 轮去水印后重检`)
      file = await removeWatermark(await ensureWatermarkAi(), { image: file })
      check = await checkImage(checkAi, { image: file, prompt })
    }

    return { file, check }
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
        let engineUsed: string = manager.engineName
        let needsWatermark = manager.hasWatermark

        while (!generated) {
          try {
            generated = await generate(prompt, reference)
            engineUsed = manager.engineName
            needsWatermark = manager.hasWatermark
          } catch (error) {
            const detail = error instanceof Error ? error.message : String(error)
            const creditError =
              error instanceof CreditLimitError ||
              error instanceof JimengCreditError ||
              isJimengCreditError(detail)

            // 只有额度限制才切换引擎；其他生成错误走修词重试
            if (!creditError) {
              const fixed = await tryFixPrompt(
                await ensureFixAi(task.sessionUrl?.() ?? undefined),
                task,
                prompt,
                error,
                tryTimes,
              )
              if (fixed) prompt = fixed
              break
            }

            if (manager.engineName === 'jimeng') {
              await markJimengCreditExhausted()
            }

            console.log(
              `[image] ${task.label} ${manager.engineName} 额度受限，尝试切换引擎: ${detail}`,
            )

            const switched = await manager.switchToNextEngine()
            if (!switched) {
              throw new Error(`没有可用的生图引擎，终止当前任务: ${detail}`)
            }
          }
        }

        // 修词后本轮没有出图，进入下一次质检尝试
        if (!generated) continue

        if (engineUsed === 'jimeng') {
          await manager.refreshJimengCredit()
        }

        if (needsWatermark) {
          try {
            generated = await removeWatermark(await ensureWatermarkAi(), { image: generated })
          } catch (error) {
            console.log(
              `[image] ${task.label} 第 ${tryTimes} 次去水印失败: ${error instanceof Error ? error.message : String(error)}`,
            )
            continue
          }
        }

        let checked: { file: File; check: CheckJson }
        try {
          checked = await checkAndCleanWatermark(generated, prompt, task.label, tryTimes)
        } catch (error) {
          console.log(
            `[image] ${task.label} 第 ${tryTimes} 次水印复检失败: ${error instanceof Error ? error.message : String(error)}`,
          )
          continue
        }

        generated = checked.file
        const check = checked.check
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
          await incrementPublishStatField('imageCount').catch((error) => {
            console.error(
              `[image] 记录生图落盘统计失败: ${
                error instanceof Error ? error.message : String(error)
              }`,
            )
          })
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
        await incrementPublishStatField('imageCount').catch((error) => {
          console.error(
            `[image] 记录生图落盘统计失败: ${
              error instanceof Error ? error.message : String(error)
            }`,
          )
        })
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
    if (watermarkAi) await watermarkAi.release()
    if (fixAi) await fixAi.release()
  }
}

/** 出图失败时改写提示词；失败只记录，不阻塞后续尝试 */
async function tryFixPrompt(
  ai: Ai,
  task: ImageTask,
  prompt: string,
  error: unknown,
  tryTimes: number,
): Promise<string | null> {
  const detail = error instanceof Error ? error.message : String(error)
  console.log(`[image] ${task.label} 第 ${tryTimes} 次出图失败，按提示词违规处理: ${detail}`)

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
