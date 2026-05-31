import { ApiCode, ApiError } from '@mountivers/ai-team-shared'

import { verifyAccessToken } from '../utils/token.js'
import { ensureUser } from '../utils/user.js'

import type { Request, Response, NextFunction } from 'express'

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  const token = req.headers.authorization?.match(/^Bearer\s(\S+)$/)?.[1]
  if (!token) {
    throw new ApiError(ApiCode.UNAUTHORIZED)
  }

  const id = await verifyAccessToken(token)
  const user = await ensureUser({ id }, ApiCode.UNAUTHORIZED)

  req.user = user
  next()
}
