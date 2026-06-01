import { Navigate, useLocation, useMatches } from 'react-router'

import type { ReactNode } from 'react'

import { LOGIN_FALLBACK_PATH, LOGIN_PATH } from '@/constants/config'
import { checkMatchHandle } from '@/router/helper'
import { useAppSelector } from '@/stores'

export default function RequireAuthGuard({ children }: { children: ReactNode }) {
  const matches = useMatches()
  const location = useLocation()
  const isLogined = useAppSelector((state) => !!state.auth.me)
  const requireAuth = checkMatchHandle(matches, (handle) => !!handle?.requireAuth, true)

  if (location.pathname === LOGIN_PATH && isLogined) {
    return <Navigate to={location.state?.from || LOGIN_FALLBACK_PATH} replace />
  }

  if (location.pathname !== LOGIN_PATH && requireAuth && !isLogined) {
    return <Navigate to={LOGIN_PATH} state={{ from: location }} replace />
  }

  return <>{children}</>
}
