import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import upyun from 'upyun'

const { Client, Service } = upyun

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const envFile = path.resolve(appDir, '.env')

if (existsSync(envFile)) {
  process.loadEnvFile(envFile)
}

const args = new Set(process.argv.slice(2))

if (args.has('--help') || args.has('-h')) {
  console.log(`用法: node scripts/deploy.js [--dry-run] [--no-delete]

环境变量:
  UPYUN_BUCKET          又拍云服务名
  UPYUN_OPERATOR        操作员名
  UPYUN_PASSWORD        操作员密码
  UPYUN_REMOTE_ROOT     远端根目录，默认 /
  UPYUN_DELETE_STALE    是否删除远端多余文件，默认 true
  UPYUN_CONCURRENCY     上传并发数，默认 8
  UPYUN_DRY_RUN         是否只预览，默认 false
  UPYUN_DIST_DIR        构建目录，默认 dist
`)
  process.exit(0)
}

const required = ['UPYUN_BUCKET', 'UPYUN_OPERATOR', 'UPYUN_PASSWORD']
const missing = required.filter((key) => !process.env[key])

if (missing.length) {
  console.error(`[deploy] 缺少环境变量: ${missing.join(', ')}`)
  console.error('[deploy] 请复制 .env.example 为 .env 并填写，或直接注入环境变量')
  process.exit(1)
}

const distDir = path.resolve(appDir, process.env.UPYUN_DIST_DIR || 'dist')
const remoteRoot = normalizeRemoteRoot(process.env.UPYUN_REMOTE_ROOT || '/')
const concurrency = clamp(Number.parseInt(process.env.UPYUN_CONCURRENCY || '8', 10) || 8, 1, 32)
const dryRun = args.has('--dry-run') || parseBoolean(process.env.UPYUN_DRY_RUN, false)
const deleteStale = !args.has('--no-delete') && parseBoolean(process.env.UPYUN_DELETE_STALE, true)

const protectedPrefixes = (process.env.UPYUN_PROTECTED_PREFIXES || '/upyun_storage_log_')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean)

if (!existsSync(distDir)) {
  console.error(`[deploy] 构建目录不存在: ${distDir}`)
  console.error('[deploy] 请先执行 pnpm build')
  process.exit(1)
}

const service = new Service(
  process.env.UPYUN_BUCKET,
  process.env.UPYUN_OPERATOR,
  process.env.UPYUN_PASSWORD,
)
const client = new Client(service)

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg',
}

const stats = {
  uploaded: 0,
  skipped: 0,
  deleted: 0,
  failed: 0,
}

try {
  await main()
} catch (error) {
  console.error(`[deploy] 失败: ${error instanceof Error ? error.message : error}`)
  process.exitCode = 1
}

async function main() {
  console.log(
    `[deploy] bucket=${process.env.UPYUN_BUCKET} root=${remoteRoot} dist=${distDir} ` +
      `concurrency=${concurrency}${dryRun ? ' dry-run' : ''}`,
  )

  const localFiles = walkLocal(distDir)
    .map((file) => ({
      file,
      relative: toPosix(path.relative(distDir, file)),
    }))
    .sort((a, b) => uploadPriority(a.relative) - uploadPriority(b.relative))

  if (!localFiles.length) {
    throw new Error(`构建目录为空: ${distDir}`)
  }

  console.log(`[deploy] 本地文件 ${localFiles.length} 个`)

  await runPool(localFiles, concurrency, async ({ file, relative }) => {
    const remote = joinRemote(remoteRoot, relative)

    try {
      const buffer = readFileSync(file)
      const md5Hex = createHash('md5').update(buffer).digest('hex')
      const md5Base64 = createHash('md5').update(buffer).digest('base64')
      const remoteInfo = await retry(() => client.headFile(remote), `HEAD ${remote}`)

      if (remoteInfo && isSameHash(remoteInfo, md5Hex, md5Base64)) {
        stats.skipped++
        console.log(`[skip] ${remote}`)
        return
      }

      if (dryRun) {
        stats.uploaded++
        console.log(`[dry-run upload] ${relative} -> ${remote}`)
        return
      }

      await retry(
        () =>
          putFile(remote, buffer, {
            // 又拍云的上传校验使用 hex MD5（SDK 的 headFile 也返回 hex）
            'Content-MD5': md5Hex,
            'Content-Type': contentType(file),
            'Cache-Control': cacheControl(relative),
          }),
        `PUT ${remote}`,
      )

      stats.uploaded++
      console.log(`[upload] ${relative} -> ${remote}`)
    } catch (error) {
      stats.failed++
      console.error(`[failed] ${relative}: ${error instanceof Error ? error.message : error}`)
      throw error
    }
  })

  if (deleteStale) {
    await removeStaleFiles(localFiles)
  } else {
    console.log('[deploy] 已跳过远端多余文件清理')
  }

  console.log(
    `[deploy] 完成: 上传 ${stats.uploaded}, 跳过 ${stats.skipped}, 删除 ${stats.deleted}, 失败 ${stats.failed}`,
  )
}

/** 列出远端文件并删除本地不存在的文件；只删除文件，不主动删目录 */
async function removeStaleFiles(localFiles) {
  console.log('[deploy] 正在读取远端文件列表…')

  const localPaths = new Set(localFiles.map(({ relative }) => joinRemote(remoteRoot, relative)))
  const remoteFiles = new Set()
  await walkRemote(remoteRoot, remoteFiles)

  const staleFiles = [...remoteFiles]
    .filter((remote) => !localPaths.has(remote))
    .filter((remote) => !isProtected(remote))
    .sort()

  if (!staleFiles.length) {
    console.log('[deploy] 远端没有需要清理的文件')
    return
  }

  console.log(`[deploy] 发现 ${staleFiles.length} 个远端多余文件`)

  await runPool(staleFiles, concurrency, async (remote) => {
    try {
      if (dryRun) {
        stats.deleted++
        console.log(`[dry-run delete] ${remote}`)
        return
      }

      const deleted = await retry(() => client.deleteFile(remote), `DELETE ${remote}`)
      if (!deleted) {
        throw new Error('删除接口返回失败')
      }

      stats.deleted++
      console.log(`[delete] ${remote}`)
    } catch (error) {
      stats.failed++
      console.error(`[failed delete] ${remote}: ${error instanceof Error ? error.message : error}`)
      throw error
    }
  })
}

async function walkRemote(dir, files) {
  let iter = ''
  const seenIters = new Set()

  while (true) {
    const page = await retry(
      () => client.listDir(dir, { limit: 1000, order: 'asc', iter }),
      `LIST ${dir}`,
    )

    if (!page) return

    for (const item of page.files) {
      if (!item?.name) continue

      const remote = path.posix.join(dir, item.name)
      if (isProtected(remote)) continue

      if (item.type === 'F' || item.type === 'folder') {
        await walkRemote(remote, files)
      } else {
        files.add(remote)
      }
    }

    const next = page.next
    if (!next || next === iter || seenIters.has(next)) break

    seenIters.add(next)
    iter = next
  }
}

/** SDK 的 putFile 不透传 Cache-Control，这里直接使用 SDK 已配置签名的 axios 客户端 */
async function putFile(remote, buffer, headers) {
  const response = await client.req.put(remote, buffer, { headers })
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`上传返回 HTTP ${response.status}`)
  }
}

function isSameHash(remoteInfo, md5Hex, md5Base64) {
  const remote = String(remoteInfo['Content-Md5'] ?? remoteInfo['Content-MD5'] ?? '')
    .replace(/"/g, '')
    .trim()

  return remote === md5Hex || remote === md5Base64 || remote.toLowerCase() === md5Hex
}

function walkLocal(dir) {
  const result = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...walkLocal(full))
    } else if (entry.isFile()) {
      result.push(full)
    }
  }
  return result
}

function uploadPriority(relative) {
  if (relative === 'index.html') return 3
  if (relative.endsWith('.html')) return 2
  if (relative === 'data/data.json') return 1
  return 0
}

function contentType(file) {
  return MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'
}

function cacheControl(relative) {
  if (relative.endsWith('.html') || relative === 'data/data.json') {
    return 'no-cache'
  }
  if (relative.startsWith('assets/')) {
    return 'public, max-age=31536000, immutable'
  }
  if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf)$/i.test(relative)) {
    return 'public, max-age=604800'
  }
  return 'public, max-age=3600'
}

function normalizeRemoteRoot(value) {
  const normalized = `/${value.trim().replace(/^\/+|\/+$/g, '')}`
  return normalized === '/' ? '/' : normalized
}

function joinRemote(root, relative) {
  return path.posix.join(root, toPosix(relative))
}

function toPosix(value) {
  return value.split(path.sep).join('/')
}

function isProtected(remote) {
  return protectedPrefixes.some((prefix) => remote.startsWith(prefix))
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === '') return fallback
  return !['0', 'false', 'no', 'off'].includes(String(value).toLowerCase())
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

async function runPool(items, limit, worker) {
  let index = 0
  const size = Math.min(limit, items.length)

  await Promise.all(
    Array.from({ length: size }, async () => {
      while (true) {
        const current = index++
        if (current >= items.length) return
        await worker(items[current])
      }
    }),
  )
}

function formatError(error) {
  if (!(error instanceof Error)) return String(error)

  const response = error.response
  const body = response?.data
  if (body && typeof body === 'object' && (body.code || body.message)) {
    return `${error.message} (${body.code || ''}${body.code && body.message ? ': ' : ''}${body.message || ''})`
  }
  if (typeof body === 'string' && body) {
    return `${error.message} (${body.slice(0, 300)})`
  }
  return error.message
}

async function retry(action, label, attempts = 3) {
  let lastError

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await action()
    } catch (error) {
      lastError = error
      if (attempt === attempts) break
      const delay = 300 * 2 ** (attempt - 1)
      console.warn(
        `[retry] ${label} 第 ${attempt}/${attempts} 次失败，${delay}ms 后重试: ${formatError(error)}`,
      )
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
