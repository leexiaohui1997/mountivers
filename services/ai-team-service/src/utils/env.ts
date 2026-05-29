import 'dotenv/config'

export const isDev = process.env.NODE_ENV === 'development'
export const PORT = Math.min(Math.max(Number(process.env.PORT) || 3000, 1), 65535)
