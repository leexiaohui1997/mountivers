import { Router, type Express } from 'express'

import { adminRouter } from './admin.js'

export function useUserRouter(app: Express) {
  const router: Router = Router()
  router.use('/admin', adminRouter)
  app.use('/api', router)
}
