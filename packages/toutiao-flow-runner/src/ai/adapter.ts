import { attachToFile } from '../utils/attach.js'
import { browserQueue } from '../utils/browser-queue.js'

import {
  beginEngineSuspend,
  endEngineSuspend,
  shouldDisableEngineOnSuspend,
} from './suspend-policy.js'
import {
  Ai,
  type AiPage,
  type ImageToImageFunc,
  type InputArgs,
  type TextToImageFunc,
  type TextToTextFunc,
} from './types.js'

/**
 * 把底层 AiPage 的页面操作适配成统一的 Ai 能力。
 *
 * text2text 的 onResult 支持在同一会话内继续追问：
 * 回调中调用 append(args) 后，适配器会发送新的提示词、等待回答，
 * 并再次触发 onResult，直到某次回调不再调用 append。
 * 所有追问都会自动把上一轮回复作为附件一起上传。
 */
/** 等待回答期间每次让出队列的时长 */
const ANSWER_YIELD_MS = 2000

export class AiPageAdapter extends Ai {
  constructor(engine: AiPage) {
    super(engine)
  }

  async release(): Promise<void> {
    await this.engine.release()
  }

  /**
   * 与引擎的额度/会员限制检测竞速：
   * 正常请求先完成则返回结果；检测命中（抛错）则立即中断。
   */
  private async raceCreditLimit<T>(request: Promise<T>): Promise<T> {
    const limitCheck = this.engine.checkCreditLimit().then<never>(() => {
      throw new Error('checkCreditLimit 未按约定抛错')
    })

    try {
      return await Promise.race([request, limitCheck])
    } finally {
      // 请求先完成时，额度检测可能仍在等待并在 10 分钟后超时；
      // 这里提前接住 rejection，避免产生 unhandledRejection。
      limitCheck.catch(() => undefined)
    }
  }

  private async suspendForEngine(waitMs: number): Promise<void> {
    const engineName = this.engine.name
    const temporaryDisable = shouldDisableEngineOnSuspend(engineName)

    if (temporaryDisable) {
      beginEngineSuspend(engineName)
    }

    try {
      await browserQueue.suspend(waitMs, () => this.engine.activate())
    } finally {
      if (temporaryDisable) {
        endEngineSuspend(engineName)
      }
    }
  }

  private async getResultWithSuspend<T>(request: Promise<T>): Promise<T> {
    let result: T | undefined
    let failure: unknown
    let settled = false

    const requestTask = (async () => {
      try {
        result = await request
      } catch (error) {
        failure = error
      } finally {
        settled = true
      }
    })()

    const yieldTask = (async () => {
      while (!settled) {
        await new Promise<void>((resolve) => setTimeout(resolve, 1800))
        if (settled) break
        await this.suspendForEngine(ANSWER_YIELD_MS)
        await new Promise<void>((resolve) => setTimeout(resolve, 1800))
      }
    })()

    await Promise.all([requestTask, yieldTask])

    if (failure) throw failure

    await this.engine.activate()
    return result as T
  }

  text2text: TextToTextFunc = async (opts) => {
    await this.engine.ensureLogin()
    await this.engine.openSession(opts.sessionUrl)
    await this.engine.clearEditor()
    for (const file of opts.attaches ?? []) {
      await this.engine.uploadFile(file)
    }
    await this.engine.input(opts.prompt)
    await this.engine.send()

    await this.engine.activate()
    let result = await this.getResultWithSuspend(this.raceCreditLimit(this.engine.getAnswer()))

    while (true) {
      let next: InputArgs | undefined
      let appended = false

      await opts.onResult?.(result, async (args) => {
        if (appended) {
          throw new Error('onResult 中 append 只能调用一次')
        }
        appended = true

        const replyFile = await attachToFile({
          type: 'markdown',
          filename: '上一轮完整回复.md',
          content: result,
        })
        const prompt = [
          args.prompt,
          '',
          '补充说明：上一轮完整回复已作为附件「上一轮完整回复.md」上传。',
          '请直接读取该附件中的完整内容，不要向用户索要原文，不要要求用户重新发送，也不要询问是否需要协助。',
          '请根据上面的校验问题修正附件内容，并直接输出修正后的完整 JSON。',
        ].join('\n')

        next = { ...args, prompt, attaches: [...(args.attaches ?? []), replyFile] }
      })

      if (!next) return result

      await this.engine.activate()
      await this.engine.clearEditor()
      for (const file of next.attaches ?? []) {
        await this.engine.uploadFile(file)
      }
      await this.engine.input(next.prompt)
      await this.engine.send()
      await this.engine.activate()
      result = await this.getResultWithSuspend(this.raceCreditLimit(this.engine.getAnswer()))
    }
  }

  text2Image: TextToImageFunc = async (opts) => {
    await this.engine.ensureLogin()
    await this.engine.openSession(opts.sessionUrl)
    await this.engine.setImageMode()
    await this.engine.clearEditor()
    for (const file of opts.attaches ?? []) {
      await this.engine.uploadImage(file)
    }
    await this.engine.input(opts.prompt)
    await this.engine.send()
    await this.engine.activate()
    return await this.getResultWithSuspend(this.raceCreditLimit(this.engine.getImageAnswer()))
  }

  image2image: ImageToImageFunc = async (opts) => {
    await this.engine.ensureLogin()
    await this.engine.openSession()
    await this.engine.clearEditor()
    await this.engine.uploadImage(opts.image)
    await this.engine.input(opts.prompt)
    await this.engine.send()
    await this.engine.activate()
    return await this.getResultWithSuspend(this.raceCreditLimit(this.engine.getImageAnswer()))
  }
}
