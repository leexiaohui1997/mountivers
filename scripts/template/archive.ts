import { createWriteStream } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { ZipArchive } from 'archiver'
import extract from 'extract-zip'
import { globby } from 'globby'

export interface CreateArchiveOptions {
  /** 被打包项目的根目录(绝对路径) */
  cwd: string
  /** 输出的 zip 文件路径(绝对路径) */
  target: string
}

export interface CreateArchiveResult {
  /** 被打包的文件数量 */
  fileCount: number
  /** 参与打包的文件相对路径列表 */
  entries: string[]
}

/** 将目录下未被 .gitignore 命中的文件打包为 zip */
export async function createArchive(options: CreateArchiveOptions): Promise<CreateArchiveResult> {
  const { cwd, target } = options

  const entries = await globby('**/*', {
    cwd,
    dot: true, // 纳入隐藏文件(.env.example 等),但 .gitignore 规则仍会过滤
    onlyFiles: true,
    gitignore: true, // 应用项目内及仓库根的 .gitignore 规则
    ignore: ['**/.git/**', '**/node_modules/**'],
  })

  if (entries.length === 0) {
    throw new Error(`目录 "${cwd}" 中没有可打包的文件(可能全部被 .gitignore 命中)`)
  }

  await mkdir(dirname(target), { recursive: true })

  const output = createWriteStream(target)
  const archive = new ZipArchive({ zlib: { level: 9 } })

  const finalized = new Promise<void>((resolve, reject) => {
    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
  })

  archive.pipe(output)
  for (const entry of entries) {
    archive.file(join(cwd, entry), { name: entry })
  }

  await archive.finalize()
  await finalized

  return { fileCount: entries.length, entries }
}

export interface ExtractArchiveOptions {
  /** 源 zip 文件路径 */
  source: string
  /** 解压目标目录(不存在则自动创建) */
  target: string
}

/** 将 zip 解压到目标目录 */
export async function extractArchive(options: ExtractArchiveOptions): Promise<void> {
  const { source, target } = options
  await mkdir(target, { recursive: true })
  await extract(source, { dir: target })
}
