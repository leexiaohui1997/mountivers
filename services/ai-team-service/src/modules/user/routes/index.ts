import { ApiCode, ApiError, UserSchema } from '@mountivers/ai-team-shared'
import { Router, type Express } from 'express'
import z from 'zod'

import { authMiddleware } from '../middlewares/auth.js'
import {
  generateAccessToken,
  generateRefreshToken,
  refreshAccessToken,
  removeToken,
} from '../utils/token.js'
import { ensureUser } from '../utils/user.js'

import { adminRouter } from './admin.js'

import { verifyPassword } from '@/utils/password.js'

export function useUserRouter(app: Express) {
  const router: Router = Router()

  router.post('/login', async (req, res) => {
    const { username, password } = UserSchema.parse(req.body)
    const user = await ensureUser({ username })

    const isPasswordValid = await verifyPassword(password, user.password)
    if (!isPasswordValid) {
      throw new ApiError(ApiCode.INVALID_PASSWORD)
    }

    await removeToken(user.id)
    const accessToken = await generateAccessToken(user.id)
    const refreshToken = await generateRefreshToken(user.id)
    res.status(201).json({
      code: ApiCode.SUCCESS,
      data: { accessToken, refreshToken },
    })
  })

  router.post('/logout', authMiddleware, async (req, res) => {
    await removeToken(req.user.id)
    res.status(200).json({
      code: ApiCode.SUCCESS,
    })
  })

  router.post('/refresh_token', async (req, res) => {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body)
    const accessToken = await refreshAccessToken(refreshToken)
    res.status(200).json({
      code: ApiCode.SUCCESS,
      data: { accessToken },
    })
  })

  router.use('/admin', adminRouter)
  app.use('/api', router)
}
