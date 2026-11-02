import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PrismaClient } from '@toutiao-flow/db'

import { createQueuedPrismaClient } from './db-write-queue.js'
import { DATABASE_URL } from './env.js'

const basePrisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: DATABASE_URL }),
})

/** 写操作统一走 dbWriteQueue；读操作直接执行 */
export const prisma = createQueuedPrismaClient(basePrisma)
