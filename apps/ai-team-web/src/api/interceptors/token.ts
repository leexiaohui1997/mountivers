import type { AxiosInstance } from 'axios'

import { getAccessToken } from '@/utils/token'

export default function applyTokenInterceptor(service: AxiosInstance) {
  service.interceptors.request.use((config) => {
    const accessToken = getAccessToken()
    if (accessToken) {
      config.headers['Authorization'] = `Bearer ${accessToken}`
    }
    return config
  })
}
