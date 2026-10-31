import path from 'node:path'

import type { ArticleJson, ImageBlock } from '../types/article.js'

export type ArticleImageKind = 'cover' | 'bilibili-cover' | 'illustration'

/** 一篇成稿需要生成的一张图 */
export interface ArticleImageSpec {
  kind: ArticleImageKind
  /** 插图在 content 中的下标；封面类为空 */
  contentIndex?: number
  /** 日志与任务标识 */
  label: string
  prompt: string
  /** 落盘绝对路径 */
  outputPath: string
}

/**
 * 规划一篇成稿的全部图片任务（固定顺序：成稿封面 → B站封面 → 插图）。
 * 路径布局：{outputDir}/{bookId}/{articleIndex}/cover.png 等。
 */
export function buildArticleImageSpecs(
  data: ArticleJson,
  bookId: string,
  articleIndex: number,
  outputDir: string,
): ArticleImageSpec[] {
  const dir = path.resolve(outputDir, bookId, String(articleIndex))
  const specs: ArticleImageSpec[] = [
    {
      kind: 'cover',
      label: 'cover',
      prompt: data.coverPrompt,
      outputPath: path.join(dir, 'cover.png'),
    },
    {
      kind: 'bilibili-cover',
      label: 'bilibili-cover',
      prompt: data.bilibiliCoverPrompt,
      outputPath: path.join(dir, 'bilibili-cover.png'),
    },
  ]

  let illustrationNo = 0
  data.content.forEach((block, contentIndex) => {
    if (block.type !== 'image') return
    illustrationNo++
    specs.push({
      kind: 'illustration',
      contentIndex,
      label: `illustration-${illustrationNo}`,
      prompt: block.prompt,
      outputPath: path.join(dir, `illustration-${illustrationNo}.png`),
    })
  })

  return specs
}

type FileExists = (filePath: string) => boolean

/** 该图是否已完成：路径字段存在且文件存在 */
export function isImageSpecDone(
  spec: ArticleImageSpec,
  data: ArticleJson,
  fileExists: FileExists,
): boolean {
  if (spec.kind === 'cover') {
    return Boolean(data.cover && fileExists(data.cover))
  }
  if (spec.kind === 'bilibili-cover') {
    return Boolean(data.bilibiliCover && fileExists(data.bilibiliCover))
  }
  if (spec.contentIndex === undefined) return false
  const block = data.content[spec.contentIndex]
  return block?.type === 'image' && Boolean(block.content && fileExists(block.content))
}

/** 从全部 spec 中筛出尚未生成的图片 */
export function findMissingImageSpecs(
  specs: ArticleImageSpec[],
  data: ArticleJson,
  fileExists: FileExists,
): ArticleImageSpec[] {
  return specs.filter((spec) => !isImageSpecDone(spec, data, fileExists))
}

/** 提示词被修词 AI 改写后，回写对应字段 */
export function withImagePrompt(
  data: ArticleJson,
  spec: ArticleImageSpec,
  prompt: string,
): ArticleJson {
  if (spec.kind === 'cover') return { ...data, coverPrompt: prompt }
  if (spec.kind === 'bilibili-cover') return { ...data, bilibiliCoverPrompt: prompt }
  return updateImageBlock(data, spec.contentIndex, (block) => ({ ...block, prompt }))
}

/** 图片生成成功后，回写路径字段 */
export function withImagePath(
  data: ArticleJson,
  spec: ArticleImageSpec,
  filePath: string,
): ArticleJson {
  if (spec.kind === 'cover') return { ...data, cover: filePath }
  if (spec.kind === 'bilibili-cover') return { ...data, bilibiliCover: filePath }
  return updateImageBlock(data, spec.contentIndex, (block) => ({ ...block, content: filePath }))
}

function updateImageBlock(
  data: ArticleJson,
  contentIndex: number | undefined,
  updater: (block: ImageBlock) => ImageBlock,
): ArticleJson {
  if (contentIndex === undefined) return data
  return {
    ...data,
    content: data.content.map((block, index) => {
      if (index !== contentIndex || block.type !== 'image') return block
      return updater(block)
    }),
  }
}
