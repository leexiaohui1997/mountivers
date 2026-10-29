import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config } from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))

// 仅加载 cli 包自己的 .env(自包含;DATABASE_URL 指向与 db 包相同的 data.db 文件)
config({ path: resolve(here, '../../.env') })

export const BOOK_UPLOAD_DIR = (): string => {
  const dir = process.env.BOOK_UPLOAD_DIR
  if (!dir) throw new Error('BOOK_UPLOAD_DIR 未配置')
  return dir
}
