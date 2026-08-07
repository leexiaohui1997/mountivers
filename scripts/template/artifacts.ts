import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { mkdir, readdir, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'

import { createArchive, extractArchive } from './archive.ts'

export const ARTIFACTS_DIR = 'templates'

export interface Artifact {
  /** 制品名称(不含 .zip 后缀) */
  name: string
  /** zip 文件绝对路径 */
  path: string
  /** 文件大小(字节) */
  size: number
  /** 最后修改时间 */
  mtime: Date
}

/** 制品目录的绝对路径 */
export function artifactsDir(root: string): string {
  return join(root, ARTIFACTS_DIR)
}

/** 列出所有制品,按修改时间倒序 */
export async function listArtifacts(root: string): Promise<Artifact[]> {
  const dir = artifactsDir(root)
  if (!existsSync(dir)) {
    return []
  }

  const names = (await readdir(dir)).filter((name) => name.endsWith('.zip'))
  const artifacts = await Promise.all(
    names.map(async (name) => {
      const path = join(dir, name)
      const info = await stat(path)
      return {
        name: basename(name, '.zip'),
        path,
        size: info.size,
        mtime: info.mtime,
      }
    }),
  )

  return artifacts.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())
}

export interface AddArtifactOptions {
  /** 被打包项目的目录(绝对路径) */
  source: string
  /** 制品名称 */
  name: string
}

export interface AddArtifactResult {
  /** 生成的 zip 绝对路径 */
  path: string
  /** 被打包的文件数量 */
  fileCount: number
}

/** 将项目打包为制品,输出到 templates/<name>.zip */
export async function addArtifact(
  root: string,
  options: AddArtifactOptions,
): Promise<AddArtifactResult> {
  const { source, name } = options
  const target = join(artifactsDir(root), `${name}.zip`)

  const { fileCount } = await createArchive({ cwd: source, target })
  return { path: target, fileCount }
}

export interface UseArtifactOptions {
  /** 制品名称 */
  artifact: string
  /** 父级目录名(相对于 workspace 根,如 apps) */
  parent: string
  /** 新建目录名 */
  dirName: string
  /** 写入 package.json 的 name 字段 */
  pkgName: string
}

export interface UseArtifactResult {
  /** 安装后的项目目录(绝对路径) */
  path: string
  /** 解压的文件数量 */
  fileCount: number
}

const PKG_NAME_RE = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/
const DIR_NAME_RE = /^[\w-]+$/

/** 从制品安装新项目到 <root>/<parent>/<dirName>,并改写 package.json 的 name */
export async function useArtifact(
  root: string,
  options: UseArtifactOptions,
): Promise<UseArtifactResult> {
  const { artifact, parent, dirName, pkgName } = options

  if (!DIR_NAME_RE.test(dirName)) {
    throw new Error(`目录名不合法:"${dirName}" 只能包含字母、数字、下划线、中划线`)
  }
  if (!PKG_NAME_RE.test(pkgName)) {
    throw new Error(`包名不合法:"${pkgName}" 不符合 npm 命名规范`)
  }

  const artifacts = await listArtifacts(root)
  const selected = artifacts.find((item) => item.name === artifact)
  if (!selected) {
    throw new Error(`制品不存在:"${artifact}"`)
  }

  const targetDir = join(root, parent, dirName)
  if (existsSync(targetDir)) {
    throw new Error(`目标目录已存在:${targetDir}`)
  }

  await mkdir(targetDir, { recursive: true })
  try {
    await extractArchive({ source: selected.path, target: targetDir })
    renamePackageName(targetDir, pkgName)
  } catch (error) {
    // 失败时回滚已创建的目录,避免留下残缺项目
    await rm(targetDir, { recursive: true, force: true })
    throw error
  }

  return { path: targetDir, fileCount: await countFiles(targetDir) }
}

async function countFiles(dir: string): Promise<number> {
  let count = 0
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += await countFiles(join(dir, entry.name))
    } else {
      count += 1
    }
  }
  return count
}

/** 改写 <dir>/package.json 的 name 字段(模板中可能不存在 package.json,则跳过) */
function renamePackageName(dir: string, name: string): void {
  const pkgFile = join(dir, 'package.json')
  if (!existsSync(pkgFile)) {
    return
  }

  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8')) as { name?: string }
  pkg.name = name
  writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
}
