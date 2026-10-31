import { attachToFile } from '../../utils/attach.js'

import type { Ai } from '../types.js'

export interface GenerateImageOptions {
  prompt: string
  reference?: File
}

/** 生成一张图片，返回落盘/后处理用的 File */
export async function generateImage(ai: Ai, opts: GenerateImageOptions): Promise<File> {
  const url = await ai.text2Image({
    prompt: opts.prompt,
    attaches: opts.reference ? [opts.reference] : undefined,
  })
  return await attachToFile({ type: 'url', path: url, filename: 'image.png' })
}
