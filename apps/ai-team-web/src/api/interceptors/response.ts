import { ApiCode, ApiError, type ApiResponse } from '@mountivers/ai-team-shared'
import { AxiosError, type AxiosInstance } from 'axios'

import { refresh } from './utils/refresh'

export default function applyResponseInterceptor(service: AxiosInstance) {
  service.interceptors.response.use(
    (res) => {
      const data = res.data as ApiResponse
      if (data.code !== ApiCode.SUCCESS) {
        const error = new ApiError(data.code, data.message)
        throw error
      }
      return res
    },
    async (err) => {
      if (err instanceof AxiosError && err.response?.data) {
        const data = err.response.data as ApiResponse
        if (data.code === ApiCode.UNAUTHORIZED) {
          await refresh()
          if (err.config) {
            return service(err.config)
          }
        }

        const error = new ApiError(data.code, data.message)
        throw error
      }
      throw err
    },
  )
}
