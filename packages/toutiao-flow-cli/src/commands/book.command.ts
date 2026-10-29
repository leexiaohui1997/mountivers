import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, copyFileSync, renameSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'

import { Arg } from '../decorators/argument.js'
import { CommandGroup } from '../decorators/command-group.js'
import { Command } from '../decorators/command.js'
import { Option } from '../decorators/option.js'
import { prisma } from '../utils/db.js'
import { BOOK_UPLOAD_DIR } from '../utils/env.js'

@CommandGroup('book', '书籍管理')
export default class BookCommands {
  @Command('add', '上传一本书并记录到数据库')
  @Option('--move', '移动文件(默认复制)', { default: false })
  async add(
    @Arg('<path>', '待上传的书籍文件绝对路径') path: string,
    opts: { move?: boolean },
  ): Promise<void> {
    const src = resolve(path)
    const ext = extname(src)
    const destName = `${randomUUID()}${ext}`
    const destDir = BOOK_UPLOAD_DIR()
    const dest = join(destDir, destName)

    mkdirSync(destDir, { recursive: true })
    if (!existsSync(src)) {
      throw new Error(`文件不存在: ${src}`)
    }

    if (opts.move) {
      renameSync(src, dest)
    } else {
      copyFileSync(src, dest)
    }

    const book = await prisma.book.create({
      data: { path: dest },
    })

    console.log(`已${opts.move ? '移动' : '上传'} ${dest} → book ${book.id}`)
  }
}
