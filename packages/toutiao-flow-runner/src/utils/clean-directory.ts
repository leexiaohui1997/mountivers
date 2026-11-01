import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'

/** 判断 child 是否等于 parent 或位于 parent 内部 */
export function isSameOrInside(parent: string, child: string): boolean {
  const from = path.resolve(parent)
  const to = path.resolve(child)
  const relative = path.relative(from, to)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/**
 * 清空目录内容，但保留目录本身。
 * 目录不存在视为成功；单个文件删除失败只记录日志，不中断清理。
 */
export async function cleanDirectory(dir: string): Promise<void> {
  const resolved = path.resolve(dir)
  if (resolved === path.parse(resolved).root) {
    throw new Error(`拒绝清理根目录: ${resolved}`)
  }

  let entries
  try {
    entries = await readdir(resolved, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }

  for (const entry of entries) {
    await rm(path.join(resolved, entry.name), { recursive: true, force: true }).catch((error) => {
      console.error(
        `[clean-directory] 删除失败: ${path.join(resolved, entry.name)}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    })
  }
}
