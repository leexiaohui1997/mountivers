import { attachToFile } from '../../utils/attach.js'
import { BrowserWaitTimeoutError } from '../../utils/browser-wait.js'

import type { Ai } from '../types.js'

export interface RemoveWatermarkOptions {
  image: File
}

/** 文心去水印；失败时最多重试 3 次 */
export async function removeWatermark(ai: Ai, opts: RemoveWatermarkOptions): Promise<File> {
  let lastError: unknown

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const url = await ai.image2image({
        image: opts.image,
        prompt: '去水印',
      })
      return await attachToFile({ type: 'url', path: url, filename: 'image.png' })
    } catch (error) {
      // 浏览器等待超时由角色层直接停止，不能在去水印里反复重试
      if (error instanceof BrowserWaitTimeoutError) throw error

      lastError = error
      console.warn(
        `[remove-watermark] 第 ${attempt}/3 次去水印失败，准备重试: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
  }

  throw new Error('文心一言去水印失败(重试 3 次)', { cause: lastError })
}
