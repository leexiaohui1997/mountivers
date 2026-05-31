import { getErrorMsg } from '@mountivers/ai-team-shared'
import { createClient } from 'redis'

import { env } from './env.js'
import { errorLog, infoLog } from './log.js'

const redisUrl = env('REDIS_URL')
if (!redisUrl) {
  errorLog('REDIS_URL 未设置')
  process.exit(1)
}

export const redis = await createClient({
  url: redisUrl,
})

export async function connectRedis() {
  try {
    await redis.connect()
    infoLog('Redis 已连接')
  } catch (err) {
    errorLog('Redis 连接失败:', getErrorMsg(err))
    throw err
  }
}

export async function disconnectRedis() {
  try {
    redis.destroy()
    infoLog('Redis 已断开')
  } catch (err) {
    errorLog('Redis 断开失败:', getErrorMsg(err))
    throw err
  }
}
