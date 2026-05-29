import 'dotenv/config'

export function env<K extends keyof NodeJS.CustomEnv>(key: K, defaultValue?: NodeJS.CustomEnv[K]) {
  return process.env[key] ?? defaultValue
}

export const isDev = env('NODE_ENV') === 'development'
export const PORT = Math.min(Math.max(1, Number(env('PORT')) || 3000), 65535)
