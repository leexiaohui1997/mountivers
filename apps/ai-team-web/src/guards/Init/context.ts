import { createContext, useContext } from 'react'

import type { User } from '@mountivers/ai-team-db'

export type InitContextType = {
  refresh: () => Promise<void>
  refreshMe: () => Promise<User | null>
}

export const InitContext = createContext<InitContextType | null>(null)

export function useInitContext() {
  const context = useContext(InitContext)
  if (!context) {
    throw new Error('useInitContext must be used within a InitProvider')
  }
  return context
}
