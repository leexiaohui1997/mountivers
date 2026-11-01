import { useEffect, useState } from 'react'

import { isWtxStats, type WtxStats } from '../types/wtx-stats'

interface StatsState {
  loading: boolean
  stats: WtxStats | null
  error: string | null
}

export function useWtxStats(): StatsState {
  const [state, setState] = useState<StatsState>({
    loading: true,
    stats: null,
    error: null,
  })

  useEffect(() => {
    const controller = new AbortController()

    fetch(`${import.meta.env.BASE_URL}generated/stats.json`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 404) return null
        if (!response.ok) {
          throw new Error(`昨日统计加载失败：HTTP ${response.status}`)
        }
        return (await response.json()) as unknown
      })
      .then((data) => {
        if (data !== null && !isWtxStats(data)) {
          throw new Error('昨日统计数据格式不正确')
        }
        setState({
          loading: false,
          stats: data as WtxStats | null,
          error: null,
        })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({
          loading: false,
          stats: null,
          error: error instanceof Error ? error.message : String(error),
        })
      })

    return () => controller.abort()
  }, [])

  return state
}
