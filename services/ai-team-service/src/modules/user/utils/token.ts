import { ApiCode, ApiError } from '@mountivers/ai-team-shared'
import jwt from 'jsonwebtoken'

import { env } from '@/utils/env.js'
import { redis } from '@/utils/redis.js'

const ACCESS_TOKEN_SECRET = env('ACCESS_TOKEN_SECRET', 'default-access-secret-key')!
const REFRESH_TOKEN_SECRET = env('REFRESH_TOKEN_SECRET', 'default-refresh-secret-key')!

const ACCESS_TOKEN_EXPIRES_IN = 15 * 60
const REFRESH_TOKEN_EXPIRES_IN = 7 * 24 * 60 * 60

export async function generateAccessToken(id: string) {
  const token = jwt.sign({ id }, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRES_IN })
  redis.setEx(`access_token:${token}`, ACCESS_TOKEN_EXPIRES_IN, id)
  redis.setEx(`access_token:${id}`, ACCESS_TOKEN_EXPIRES_IN, token)
  return token
}

export async function removeAccessToken(id: string) {
  const token = await redis.get(`access_token:${id}`)
  if (token) {
    await redis.del(`access_token:${token}`)
    await redis.del(`access_token:${id}`)
  }
}

export async function verifyAccessToken(token: string) {
  const id = await redis.get(`access_token:${token}`)
  if (!id) {
    throw new ApiError(ApiCode.UNAUTHORIZED)
  }
  return id
}

export async function generateRefreshToken(id: string) {
  const token = jwt.sign({ id }, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRES_IN })
  redis.setEx(`refresh_token:${token}`, REFRESH_TOKEN_EXPIRES_IN, id)
  redis.setEx(`refresh_token:${id}`, REFRESH_TOKEN_EXPIRES_IN, token)
  return token
}

export async function removeRefreshToken(id: string) {
  const token = await redis.get(`refresh_token:${id}`)
  if (token) {
    await redis.del(`refresh_token:${token}`)
    await redis.del(`refresh_token:${id}`)
  }
}

export async function verifyRefreshToken(token: string) {
  const id = await redis.get(`refresh_token:${token}`)
  if (!id) {
    throw new ApiError(ApiCode.INVALID_REFRESH_TOKEN)
  }
  return id
}

export async function generateToken(id: string) {
  const accessToken = await generateAccessToken(id)
  const refreshToken = await generateRefreshToken(id)
  return { accessToken, refreshToken }
}

export async function removeToken(id: string) {
  await removeAccessToken(id)
  await removeRefreshToken(id)
}

export async function refreshToken(refreshToken: string) {
  const id = await verifyRefreshToken(refreshToken)
  await removeToken(id)
  return generateToken(id)
}
