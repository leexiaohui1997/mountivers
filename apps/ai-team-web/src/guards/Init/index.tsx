import { useRequest } from 'ahooks'
import { useDispatch } from 'react-redux'

import { InitContext } from './context'

import type { ReactNode } from 'react'

import { getMe } from '@/api/user'
import { authSlice } from '@/stores/auth'
import { getAccessToken } from '@/utils/token'

export function InitGuard({ children }: { children: ReactNode }) {
  const dispatch = useDispatch()

  const { runAsync: refreshMe } = useRequest(
    async () => {
      const me = getAccessToken() ? await getMe() : null
      dispatch(authSlice.actions.setMe(me))
      return me
    },
    { manual: true },
  )

  const { loading, runAsync: refresh } = useRequest(async () => {
    await refreshMe()
  })

  if (loading) {
    return <></>
  }

  return <InitContext.Provider value={{ refresh, refreshMe }}>{children}</InitContext.Provider>
}
