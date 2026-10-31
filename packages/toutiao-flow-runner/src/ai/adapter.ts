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
 */
export class AiPageAdapter extends Ai {
  constructor(engine: AiPage) {
    super(engine)
  }

  async release(): Promise<void> {
    await this.engine.release()
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

    let result = await this.engine.getAnswer()

    while (true) {
      let next: InputArgs | undefined
      let appended = false

      await opts.onResult?.(result, async (args) => {
        if (appended) {
          throw new Error('onResult 中 append 只能调用一次')
        }
        appended = true
        next = args
      })

      if (!next) return result

      await this.engine.clearEditor()
      for (const file of next.attaches ?? []) {
        await this.engine.uploadFile(file)
      }
      await this.engine.input(next.prompt)
      await this.engine.send()
      result = await this.engine.getAnswer()
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
    return await this.engine.getImageAnswer()
  }

  image2image: ImageToImageFunc = async (opts) => {
    await this.engine.ensureLogin()
    await this.engine.openSession()
    await this.engine.clearEditor()
    await this.engine.uploadImage(opts.image)
    await this.engine.input(opts.prompt)
    await this.engine.send()
    return await this.engine.getImageAnswer()
  }
}
