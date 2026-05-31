import { createSlice } from '@reduxjs/toolkit'

import type { User } from '@mountivers/ai-team-db'

export type AuthState = {
  token: string
  accountInfo: User | null
}

export const authSlice = createSlice({
  name: 'auth',
  initialState: {
    token: '',
    accountInfo: null,
  } satisfies AuthState as AuthState,
  reducers: {},
})
