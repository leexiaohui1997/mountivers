import { defineApi, service } from './base'

import type { UserSchema } from '@mountivers/ai-team-shared'
import type z from 'zod'

export const initAdmin = defineApi((data: z.infer<typeof UserSchema>) =>
  service.post('/api/admin/init', {
    username: data.username,
    password: data.password,
  }),
)
