import { configureStore } from '@reduxjs/toolkit'
import { useSelector, type UseSelector } from 'react-redux'

import { authSlice } from './auth'

export const store = configureStore({
  reducer: {
    auth: authSlice.reducer,
  },
})

export type RootState = ReturnType<typeof store.getState>
export const useAppSelector: UseSelector<RootState> = useSelector
