import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { parse as parseYaml } from 'yaml'

export interface WorkspaceInfo {
  /** monorepo 根目录(包含 pnpm-workspace.yaml 的目录) */
  root: string
  /** 可作为安装父级的目录名,如 apps、nest、next、services、packages */
  parents: string[]
}

const WORKSPACE_FILE = 'pnpm-workspace.yaml'

/** 从当前目录向上查找 monorepo 根(即包含 pnpm-workspace.yaml 的目录) */
export function findWorkspaceRoot(start: string = process.cwd()): string {
  let current = start
  for (;;) {
    if (existsSync(join(current, WORKSPACE_FILE))) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) {
      throw new Error(`未找到 ${WORKSPACE_FILE},请确认在项目目录内运行`)
    }
    current = parent
  }
}

/**
 * 从 pnpm-workspace.yaml 解析可作为安装父级的目录名。
 * 例如 `- 'apps/*'` → `apps`;`- 'packages/**'` → `packages`。
 * 排除负向模式与不含通配符的裸路径。
 */
export function readWorkspaceParents(root: string): string[] {
  const file = join(root, WORKSPACE_FILE)
  if (!existsSync(file)) {
    return []
  }

  const raw = readFileSync(file, 'utf8')
  const doc = parseYaml(raw) as { packages?: string[] } | null
  const patterns = doc?.packages ?? []

  const parents = new Set<string>()
  for (const pattern of patterns) {
    if (typeof pattern !== 'string' || pattern.startsWith('!')) {
      continue
    }
    const match = /^([^/*]+)\/[*]/.exec(pattern)
    if (match) {
      parents.add(match[1])
    }
  }

  return [...parents]
}

/** 读取 workspace 信息:根目录 + 父级目录列表 */
export function readWorkspace(start: string = process.cwd()): WorkspaceInfo {
  const root = findWorkspaceRoot(start)
  return { root, parents: readWorkspaceParents(root) }
}
