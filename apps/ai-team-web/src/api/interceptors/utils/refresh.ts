import { ApiCode, ApiError } from '@mountivers/ai-team-shared'

import { refreshTokens } from '@/api/user'
import { LOGIN_PATH } from '@/constants/config'
import { router } from '@/router'
import { store } from '@/stores'
import { authSlice } from '@/stores/auth'
import { cleanTokens, getRefreshToken, setTokens } from '@/utils/token'

export type QueueItem = {
  resolve: (value: unknown) => void
  reject: (reason?: unknown) => void
}

let queue: QueueItem[] = []
let isRefreshing = false

export async function refresh() {
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      queue.push({ resolve, reject })
    })
  }

  isRefreshing = true
  try {
    const refreshToken = getRefreshToken()
    if (!refreshToken) {
      throw new ApiError(ApiCode.INVALID_REFRESH_TOKEN)
    }

    const tokens = await refreshTokens(refreshToken)
    setTokens(tokens)
    queue.forEach((item) => item.resolve(tokens))
  } catch (err) {
    queue.forEach((item) => item.reject(err))
    cleanTokens()
    store.dispatch(authSlice.actions.setMe(null))
    router.navigate(LOGIN_PATH, {
      replace: true,
      state: {
        from: router.state.location,
      },
    })
    throw err
  } finally {
    queue = []
    isRefreshing = false
  }
}
