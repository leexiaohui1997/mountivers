import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { config } from 'dotenv'

const here = dirname(fileURLToPath(import.meta.url))

config({ path: resolve(here, '../../.env') })

function envVar(name: string, required = false) {
  const v = process.env[name]
  if (!v && required) throw new Error(`${name} 未配置`)
  return v
}

export const BROWSER_DATA_DIR = envVar('BROWSER_DATA_DIR', true)!
export const BROWSER_VIEWPORT_WIDTH = Number(envVar('BROWSER_VIEWPORT_WIDTH')) || 1280
export const BROWSER_VIEWPORT_HEIGHT = Number(envVar('BROWSER_VIEWPORT_HEIGHT')) || 800
export const BROWSER_HEADLESS = envVar('BROWSER_HEADLESS') === 'true'

export const DATABASE_URL = envVar('DATABASE_URL', true)!

export const TEMPLATE_DIR = resolve(here, '../../templates')

export const IMAGE_DOWNLOAD_DIR = envVar('IMAGE_DOWNLOAD_DIR', true)!

/** 是否启用 JSON 文案判定；未配置时默认开启 */
export const ENABLE_JSON_CONTENT_JUDGE = !['false', '0', 'no', 'off'].includes(
  (envVar('ENABLE_JSON_CONTENT_JUDGE') ?? 'true').toLowerCase(),
)
