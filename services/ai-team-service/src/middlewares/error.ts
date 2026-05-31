import { ApiCode, ApiError, getErrorMsg } from '@mountivers/ai-team-shared'
import z, { ZodError } from 'zod'

import type { Express, NextFunction, Request, Response } from 'express'

import { errorLog } from '@/utils/log.js'

// API 码到状态码映射
const API_CODE_STATUS: Partial<Record<ApiCode, number>> = {
  [ApiCode.PARAM_ERROR]: 400,
  [ApiCode.UNAUTHORIZED]: 401,
}

export function useErrorMiddleware(app: Express) {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) {
      const { errors } = z.treeifyError(err)
      const error = new ApiError(ApiCode.PARAM_ERROR)
      res.status(API_CODE_STATUS[error.code] || 400).json({
        code: ApiCode.PARAM_ERROR,
        message: error.message,
        errors,
      })
      return
    }

    const error =
      err instanceof ApiError ? err : new ApiError(ApiCode.UNKNOWN_ERROR, getErrorMsg(err))
    errorLog(error.message, `[${error.code}]`)
    res
      .status(API_CODE_STATUS[error.code] || 500)
      .json({ code: error.code, message: error.message })
  })
}
