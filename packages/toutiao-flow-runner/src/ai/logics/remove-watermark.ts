import { attachToFile } from '../../utils/attach.js'

import type { Ai } from '../types.js'

export interface RemoveWatermarkOptions {
  image: File
}

/** 文心去水印；失败时最多重试 3 次 */
export async function removeWatermark(ai: Ai, opts: RemoveWatermarkOptions): Promise<File> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const url = await ai.image2image({
        image: opts.image,
        prompt: '去水印',
      })
      return await attachToFile({ type: 'url', path: url, filename: 'image.png' })
    } catch {
      // 继续下一轮重试
    }
  }

  throw new Error('文心一言去水印失败(重试 3 次)')
}
