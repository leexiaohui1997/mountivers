import { readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { Scheduler } from '../scheduler.js'
import { sleep } from '../timer.js'

import BaseRole from './base.js'

const roles: BaseRole[] = []
const ROLE_SUFFIX = '.role'
const currentExt = import.meta.url.endsWith('.ts') ? '.ts' : '.js'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walk(full, out)
    } else if (entry.endsWith(`${ROLE_SUFFIX}${currentExt}`)) {
      out.push(full)
    }
  }
  return out
}

/**
 * 递归扫描 roles/ 下所有 *.role.{ts,js},动态导入 default、
 * 实例化并筛选 BaseRole 子类后注册。返回注册后的角色数组。
 */
let loaded = false

export async function loadRoles(): Promise<BaseRole[]> {
  if (loaded) return roles
  loaded = true

  const rolesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'roles')
  for (const file of walk(rolesDir)) {
    const mod = await import(pathToFileURL(file).href)
    const Cls = mod.default
    if (typeof Cls !== 'function') continue
    const instance = new Cls()
    if (instance instanceof BaseRole) {
      roles.push(instance)
    }
  }

  // 优先级从高到低；同优先级保持文件扫描顺序（Array.sort 稳定）
  roles.sort((a, b) => b.priority - a.priority)
  return roles
}

export { roles }

/**
 * 调度守护进程:持续 tick,持有"当前时间"概念,到点即触发含 cron 的角色。
 * 编排层 —— 时间计算委托 cron.ts,执行/并发委托 Scheduler。
 * @param opts.tickMs 轮询间隔(ms),默认 1000
 * @param opts.now    时钟注入(可测),默认 Date.now
 * @param opts.signal 中止信号(优雅停机)
 */
export async function runRoles(opts?: {
  tickMs?: number
  now?: () => number
  signal?: AbortSignal
}): Promise<void> {
  await loadRoles()
  const clock = opts?.now ?? (() => Date.now())
  const tickMs = opts?.tickMs ?? 1000
  const scheduler = new Scheduler()

  scheduler.init(roles, clock())
  while (!opts?.signal?.aborted) {
    // tick 只负责启动到点角色，不等待 run 结束：不同角色并行，长任务不阻塞后续 tick
    scheduler.tick(roles, clock())
    if (opts?.signal?.aborted) break
    try {
      await sleep(tickMs, opts?.signal)
    } catch {
      break // 被 signal 中断
    }
  }
}
