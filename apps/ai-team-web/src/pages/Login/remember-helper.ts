import type { UserSchema } from '@mountivers/ai-team-shared'
import type z from 'zod'

const REMEMBER_KEY = 'remember'

export type RememberState = z.infer<typeof UserSchema>

export function getRememberState(): RememberState | null {
  try {
    const state = localStorage.getItem(REMEMBER_KEY)
    if (!state) return null
    return JSON.parse(state)
  } catch {
    return null
  }
}

export function setRememberState(state: RememberState) {
  localStorage.setItem(REMEMBER_KEY, JSON.stringify(state))
}

export function removeRememberState() {
  localStorage.removeItem(REMEMBER_KEY)
}
