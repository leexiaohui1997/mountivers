import { ApiCode, ApiError } from '@mountivers/ai-team-shared'

import type { Express } from 'express'

import { prisma } from '@/utils/db.js'
import { errorLog, infoLog } from '@/utils/log.js'

// 放行白名单
const WHITE_LIST = ['/api/admin/init']
// 缓存结果
let checkPassed = false

export function useEnsureAdminMiddleware(app: Express) {
  app.use(async (req, res, next) => {
    if (checkPassed || WHITE_LIST.some((url) => req.path.startsWith(url))) {
      next()
      return
    }

    const adminUser = await prisma.user.findFirst({
      where: { isAdmin: true },
      select: { id: true },
    })

    if (!adminUser) {
      const error = new ApiError(ApiCode.ADMIN_NOT_INITIALIZED)
      errorLog(error.message)
      res.status(503).json({
        code: error.code,
        message: error.message,
      })
      return
    }

    checkPassed = true
    next()
  })

  infoLog('CheckHasAdmin 中间件已挂载')
}
