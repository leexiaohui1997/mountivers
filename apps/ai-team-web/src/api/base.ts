import { ApiCode, ApiError, type ApiResponse } from '@mountivers/ai-team-shared'
import axios, { type AxiosResponse } from 'axios'

import applyResponseInterceptor from './interceptors/response'
import applyTokenInterceptor from './interceptors/token'

export const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

applyTokenInterceptor(service)
applyResponseInterceptor(service)

export function defineApi<T = void, D = void>(
  fn: (data: D) => Promise<AxiosResponse<ApiResponse<T>>>,
) {
  return async (data: D): Promise<T> => {
    const result = await fn(data)
    if (result.data.code === ApiCode.SUCCESS) {
      return result.data.data
    }
    throw new ApiError(result.data.code, result.data.message)
  }
}
