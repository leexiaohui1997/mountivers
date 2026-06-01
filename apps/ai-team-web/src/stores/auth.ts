import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { User } from '@mountivers/ai-team-db'

export type AuthState = {
  me: User | null
}

export const authSlice = createSlice({
  name: 'auth',
  initialState: {
    me: null,
  } satisfies AuthState as AuthState,
  reducers: {
    setMe: (state, action: PayloadAction<User | null>) => {
      state.me = action.payload
    },
  },
})
