import { defineApi, service } from './base'

import type { TokenType } from '@/utils/token'
import type { User } from '@mountivers/ai-team-db'
import type { UserSchema } from '@mountivers/ai-team-shared'
import type z from 'zod'

export const initAdmin = defineApi((data: z.infer<typeof UserSchema>) =>
  service.post('/api/admin/init', {
    username: data.username,
    password: data.password,
  }),
)

export const getMe = defineApi<User>(() => service.get('/api/me'))

export const login = defineApi<TokenType, z.infer<typeof UserSchema>>((data) =>
  service.post('/api/login', {
    username: data.username,
    password: data.password,
  }),
)

export const refreshTokens = defineApi<TokenType, string>((refreshToken) =>
  service.post('/api/refresh_token', {
    refreshToken,
  }),
)
