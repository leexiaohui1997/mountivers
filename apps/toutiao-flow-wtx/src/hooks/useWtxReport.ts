import { useEffect, useState } from 'react'

import { isWtxReport, type WtxReport } from '../types/wtx-report'

interface ReportState {
  loading: boolean
  report: WtxReport | null
  error: string | null
}

export function useWtxReport(): ReportState {
  const [state, setState] = useState<ReportState>({
    loading: true,
    report: null,
    error: null,
  })

  useEffect(() => {
    const controller = new AbortController()

    fetch(`${import.meta.env.BASE_URL}generated/data.json`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`报表加载失败：HTTP ${response.status}`)
        }
        return (await response.json()) as unknown
      })
      .then((data) => {
        if (!isWtxReport(data)) {
          throw new Error('报表数据格式不正确')
        }
        setState({ loading: false, report: data, error: null })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({
          loading: false,
          report: null,
          error: error instanceof Error ? error.message : String(error),
        })
      })

    return () => controller.abort()
  }, [])

  return state
}
