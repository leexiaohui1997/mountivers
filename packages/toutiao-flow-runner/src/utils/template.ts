import { existsSync } from 'node:fs'
import path from 'node:path'

import ejs from 'ejs'

import { attachToFile } from './attach.js'
import { TEMPLATE_DIR } from './env.js'

const TEMPLATE_EXT = ['md']

export function resolveFileName(name: string) {
  for (const ext of TEMPLATE_EXT) {
    const filePath = path.resolve(TEMPLATE_DIR, `${name}.${ext}`)
    if (existsSync(filePath)) {
      return filePath
    }
  }
  throw new Error(`模板 ${name} 不存在`)
}

export async function renderTemplate(name: string, data: Record<string, unknown> = {}) {
  const filename = resolveFileName(name)
  const options: ejs.Options = {
    filename,
    cache: true,
    root: TEMPLATE_DIR,
    rmWhitespace: false,
    async: true,
  }
  return await ejs.renderFile(filename, data, options)
}

export async function renderToAttach(
  name: string,
  dataOrFilename: Record<string, unknown> | string = {},
  filename?: string,
): Promise<File> {
  const data = typeof dataOrFilename === 'string' ? {} : dataOrFilename
  const finalFilename =
    filename ??
    (typeof dataOrFilename === 'string' ? dataOrFilename : path.basename(resolveFileName(name)))
  const content = await renderTemplate(name, data)
  return await attachToFile({
    type: 'markdown',
    filename: finalFilename,
    content,
  })
}
