import { readdir } from 'node:fs/promises'
import path from 'node:path'

const BOOK_EXTENSIONS = new Set(['.pdf', '.mobi', '.epub'])

export interface ScannedBook {
  path: string
}

/** 深度扫描书籍目录；跳过隐藏文件和隐藏目录，不跟随软链接 */
export async function scanBookFiles(rootDir: string): Promise<ScannedBook[]> {
  const root = path.resolve(rootDir)
  const files: ScannedBook[] = []

  await walk(root, files)

  return shuffle(files)
}

/** Fisher-Yates 随机打乱，避免每次导入顺序固定 */
function shuffle<T>(items: T[]): T[] {
  const result = [...items]

  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }

  return result
}

async function walk(dir: string, files: ScannedBook[]): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue

    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      await walk(fullPath, files)
      continue
    }

    if (!entry.isFile()) continue
    if (!BOOK_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue

    files.push({ path: fullPath })
  }
}
