import { useMatches } from 'react-router'

import type { ReactNode } from 'react'

import NotAdmin from '@/components/NotAdmin'
import { checkMatchHandle } from '@/router/helper'
import { useAppSelector } from '@/stores'

export default function RequireAdminGuard({ children }: { children: ReactNode }) {
  const isAdmin = useAppSelector((state) => !!state.auth.me?.isAdmin)
  const matches = useMatches()
  const requireAdmin = checkMatchHandle(matches, (handle) => !!handle?.requireAdmin, true)

  if (requireAdmin && !isAdmin) {
    return <NotAdmin />
  }

  return <>{children}</>
}
