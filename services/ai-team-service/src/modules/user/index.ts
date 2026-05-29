import { type Express } from 'express'

import { useEnsureAdminMiddleware } from './middlewares/ensure-admin.js'
import { useUserRouter } from './routes/index.js'

export function useUserModule(app: Express) {
  useEnsureAdminMiddleware(app)
  useUserRouter(app)
}
