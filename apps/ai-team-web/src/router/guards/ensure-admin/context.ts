import { createContext, useContext } from 'react'

import type { CheckStatus } from './constants'

export type EnsureAdminContextType = {
  status: CheckStatus
  refresh: () => void
}

export const EnsureAdminContext = createContext<EnsureAdminContextType>(null)

export function useEnsureAdminContext() {
  return useContext(EnsureAdminContext)
}
