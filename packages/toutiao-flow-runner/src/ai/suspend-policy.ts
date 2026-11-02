/**
 * 哪些引擎在任务挂起期间需要临时禁用。
 * 为空表示挂起期间不限制任何引擎；需要时加入引擎名，例如 'wenxin'。
 */
export const DISABLE_ENGINE_ON_SUSPEND = new Set<string>()

const suspendedCounts = new Map<string, number>()

export function shouldDisableEngineOnSuspend(engineName: string): boolean {
  return DISABLE_ENGINE_ON_SUSPEND.has(engineName)
}

export function beginEngineSuspend(engineName: string): void {
  suspendedCounts.set(engineName, (suspendedCounts.get(engineName) ?? 0) + 1)
}

export function endEngineSuspend(engineName: string): void {
  const next = (suspendedCounts.get(engineName) ?? 0) - 1
  if (next > 0) {
    suspendedCounts.set(engineName, next)
  } else {
    suspendedCounts.delete(engineName)
  }
}

export function isEngineTemporarilyDisabled(engineName: string): boolean {
  return (suspendedCounts.get(engineName) ?? 0) > 0
}
