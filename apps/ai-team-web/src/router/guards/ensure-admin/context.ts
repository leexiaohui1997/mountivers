import { createContext, useContext } from 'react'

import type { CheckStatus } from './constants'

export type EnsureAdminContextType = {
  status: CheckStatus
  refresh: () => void
}

export const EnsureAdminContext = createContext<EnsureAdminContextType | null>(null)

export function useEnsureAdminContext() {
  const context = useContext(EnsureAdminContext)
  if (!context) {
    throw new Error('useEnsureAdminContext must be used within a EnsureAdminProvider')
  }
  return context
}
