import cors, { type CorsOptions } from 'cors'

import type { Express } from 'express'

import { isDev } from '@/utils/env.js'

export function useCorsMiddleware(app: Express) {
  const options: CorsOptions = {
    origin: [],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  }

  if (isDev) {
    Object.assign<CorsOptions, CorsOptions>(options, {
      origin: '*',
    })
  }

  app.use(cors(options))
}
