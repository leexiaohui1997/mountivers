import { ApiCode, ApiError } from '@mountivers/ai-team-shared'
import { useRequest } from 'ahooks'
import { type ReactNode } from 'react'
import { Navigate, useLocation, type Location } from 'react-router'

import { CheckStatus, INIT_ADMIN_PATH, WHITE_PATHS } from './constants'
import { EnsureAdminContext } from './context'

import { checkHealth } from '@/api/utils'
import ErrorResult from '@/components/ErrorResult'

export default function EnsureAdminGuard({ children }: { children: ReactNode }) {
  const location: Location<{ from?: Location }> = useLocation()

  const isWhitePath = WHITE_PATHS.some((p) => location.pathname.startsWith(p))

  const { data, error, refresh, loading } = useRequest(async () => {
    try {
      await checkHealth()
      return CheckStatus.CHECKED_PASSED
    } catch (err) {
      if (err instanceof ApiError && err.code === ApiCode.ADMIN_NOT_INITIALIZED) {
        return CheckStatus.CHECKED_FAILED
      }
      throw err
    }
  })

  if (loading) {
    return <></>
  }

  if (error) {
    return <ErrorResult error={error} />
  }

  if (data === CheckStatus.CHECKED_FAILED && !isWhitePath) {
    return <Navigate to={INIT_ADMIN_PATH} state={{ from: location }} replace />
  }

  if (data === CheckStatus.CHECKED_PASSED && location.pathname === INIT_ADMIN_PATH) {
    return <Navigate to={location.state?.from || '/'} replace />
  }

  return (
    <EnsureAdminContext.Provider value={{ status: data, refresh }}>
      {children}
    </EnsureAdminContext.Provider>
  )
}
