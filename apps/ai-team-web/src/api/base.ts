import { ApiCode, ApiError, type ApiResponse } from '@mountivers/ai-team-shared'
import axios, { AxiosError, type AxiosResponse } from 'axios'

export const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
})

service.interceptors.response.use(
  (res) => {
    const data = res.data as ApiResponse
    if (data.code !== ApiCode.SUCCESS) {
      const error = new ApiError(data.code, data.message)
      throw error
    }
    return res
  },
  (err) => {
    if (err instanceof AxiosError && err.response?.data) {
      const data = err.response.data as ApiResponse
      const error = new ApiError(data.code, data.message)
      throw error
    }
    throw err
  },
)

export function defineApi<T = void, D = void>(
  fn: (data: D) => Promise<AxiosResponse<ApiResponse<T>>>,
) {
  return fn
}
