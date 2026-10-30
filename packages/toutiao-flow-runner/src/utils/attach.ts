import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type UrlAttach = {
  type: 'url'
  path: string
  filename?: string
}

export type FileAttach = {
  type: 'file'
  path: string
}

export type MarkdownAttach = {
  type: 'markdown'
  filename: string
  content: string
}

export type Attach = FileAttach | MarkdownAttach | UrlAttach

const MIME_MAP: Record<string, string> = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.json': 'application/json',
  '.json5': 'application/json',
  '.csv': 'text/csv',
  '.html': 'text/html',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.epub': 'application/epub+zip',
}

function getMimeType(filename: string) {
  return MIME_MAP[path.extname(filename).toLowerCase()] || 'application/octet-stream'
}

export async function attachToFile(attach: Attach): Promise<File> {
  if (attach.type === 'markdown') {
    return new File([attach.content], attach.filename, {
      type: getMimeType(attach.filename),
      lastModified: Date.now(),
    })
  }

  if (attach.type === 'url') {
    const res = await fetch(attach.path)
    if (!res.ok) {
      throw new Error(`附件 URL 下载失败 ${res.status}：${attach.path}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const filename =
      attach.filename || decodeURIComponent(attach.path.split('/').pop() || 'download')
    const contentType = res.headers.get('content-type') || getMimeType(filename)
    return new File([new Uint8Array(buf)], filename, {
      type: contentType,
      lastModified: Date.now(),
    })
  }

  const filePath = path.isAbsolute(attach.path)
    ? attach.path
    : path.resolve(process.cwd(), attach.path)

  let content: Buffer
  try {
    content = await readFile(filePath)
  } catch {
    throw new Error(`附件文件不存在或无法读取：${filePath}`)
  }

  return new File([new Uint8Array(content)], path.basename(filePath), {
    type: getMimeType(filePath),
    lastModified: Date.now(),
  })
}

export async function saveFile(file: File, outputPath: string) {
  const dir = path.dirname(outputPath)
  await mkdir(dir, { recursive: true })

  const buf = Buffer.from(await file.arrayBuffer())
  await writeFile(outputPath, buf)
}
