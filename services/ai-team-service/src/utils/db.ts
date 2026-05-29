import { PrismaClient } from '@mountivers/ai-team-db'
import { PrismaPg } from '@prisma/adapter-pg'

import { env } from './env.js'
import { getErrorMsg } from './error.js'
import { errorLog, infoLog } from './log.js'

const DATABASE_URL = env('DATABASE_URL')
if (!DATABASE_URL) {
  errorLog('DATABASE_URL 未设置')
  process.exit(1)
}

const adapter = new PrismaPg({
  connectionString: DATABASE_URL,
})

export const prisma: PrismaClient = new PrismaClient({
  adapter,
})

export async function connectDB() {
  try {
    await prisma.$connect()
    infoLog('数据库已连接')
  } catch (err) {
    errorLog('数据库连接失败:', getErrorMsg(err))
    throw err
  }
}

export async function disconnectDB() {
  try {
    await prisma.$disconnect()
    infoLog('数据库已关闭')
  } catch (err) {
    errorLog('数据库关闭失败:', getErrorMsg(err))
    throw err
  }
}
