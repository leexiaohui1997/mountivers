import { PrismaLibSql } from '@prisma/adapter-libsql'
import { PrismaClient } from '@toutiao-flow/db'
import './env.js'

export const prisma = new PrismaClient({
  adapter: new PrismaLibSql({ url: process.env.DATABASE_URL! }),
})
