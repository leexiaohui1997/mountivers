import { ApiCode, ApiError } from '@mountivers/ai-team-shared'

import type { Express, NextFunction, Request, Response } from 'express'

import { getErrorMsg } from '@/utils/error.js'
import { errorLog } from '@/utils/log.js'

export function useErrorMiddleware(app: Express) {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const error =
      err instanceof ApiError ? err : new ApiError(ApiCode.UNKNOWN_ERROR, getErrorMsg(err))
    errorLog(error.message, `[${error.code}]`)
    res.status(500).json({ code: error.code, message: error.message })
  })
}
