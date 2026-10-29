import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PrismaClient } from '@toutiao-flow/db'

import { DATABASE_URL } from './env.js'

export const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: DATABASE_URL }),
})
