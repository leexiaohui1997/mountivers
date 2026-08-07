import chalk from 'chalk'
import { Command } from 'commander'

import { addArtifact, listArtifacts, useArtifact } from './template/artifacts.ts'
import { readWorkspace } from './template/workspace.ts'
import { confirm, input, select, selectPackage } from './utils/interaction.ts'
import { listPackages } from './utils/monorepo.ts'

process.on('unhandledRejection', (error) => {
  console.error(chalk.red(`未捕获的异常:${formatError(error)}`))
  process.exit(1)
})

const program = new Command()

program
  .name('template')
  .description('将 monorepo 中的项目打包为模板制品,或从制品安装新项目')
  .version('0.1.0')

program
  .command('add')
  .description('选择一个项目,打包为制品输出到 templates/<name>.zip')
  .action(async () => {
    try {
      await runAdd()
    } catch (error) {
      console.error(chalk.red(`✖ ${formatError(error)}`))
      process.exit(1)
    }
  })

program
  .command('use')
  .description('选择制品,安装到指定父级目录并改写 package.json 的 name')
  .action(async () => {
    try {
      await runUse()
    } catch (error) {
      console.error(chalk.red(`✖ ${formatError(error)}`))
      process.exit(1)
    }
  })

program
  .command('list')
  .description('列出所有制品')
  .action(async () => {
    try {
      await runList()
    } catch (error) {
      console.error(chalk.red(`✖ ${formatError(error)}`))
      process.exit(1)
    }
  })

program.parse()

// ---------- 命令实现 ----------

async function runAdd(): Promise<void> {
  const { root } = readWorkspace()
  const pkgs = (await listPackages()).slice(1)
  if (!pkgs.length) {
    console.log(chalk.yellow('没有可以选择的项目'))
    return
  }

  const selected = await selectPackage('请选择要制作成模板的项目', pkgs)
  if (!selected) {
    return
  }

  const name = await input('请输入制品名称', {
    initial: selected.basename,
    validate: (value) => {
      if (!value.trim()) {
        return '制品名称不能为空'
      }
      if (/[\\/:*?"<>|]/.test(value)) {
        return '制品名称不能包含 \\ / : * ? " < > | 等字符'
      }
      return true
    },
  })
  if (!name) {
    return
  }

  const artifacts = await listArtifacts(root)
  const exists = artifacts.some((item) => item.name === name)
  if (exists) {
    const ok = await confirm(`制品 "${name}" 已存在,是否覆盖?`, false)
    if (!ok) {
      return
    }
  }

  const { path, fileCount } = await addArtifact(root, { source: selected.path, name })
  console.log(chalk.green(`✔ 已生成制品 "${name}"(${fileCount} 个文件):${path}`))
}

async function runUse(): Promise<void> {
  const { root, parents } = readWorkspace()
  const artifacts = await listArtifacts(root)
  if (!artifacts.length) {
    console.log(chalk.yellow('没有可用的制品,请先执行 template add'))
    return
  }

  const artifact = await select(
    '请选择要安装的制品',
    artifacts.map((item) => ({
      name: item.name,
      message: `${chalk.green(item.name)} ${chalk.gray(formatSize(item.size))}`,
    })),
  )
  if (!artifact) {
    return
  }

  if (!parents.length) {
    console.error(chalk.red('✖ 未从 pnpm-workspace.yaml 解析到父级目录'))
    process.exit(1)
  }
  const parent = await select('请选择安装的父级目录', parents)
  if (!parent) {
    return
  }

  const dirName = await input('请输入新目录名称', {
    validate: (value) => {
      if (!value.trim()) {
        return '目录名称不能为空'
      }
      if (/[\\/:*?"<>|]/.test(value)) {
        return '目录名称不能包含 \\ / : * ? " < > | 等字符'
      }
      return true
    },
  })
  if (!dirName) {
    return
  }

  const pkgName = await input('请输入包名(name)', {
    initial: dirName,
    validate: (value) => {
      if (!value.trim()) {
        return '包名不能为空'
      }
      return true
    },
  })
  if (!pkgName) {
    return
  }

  const { path, fileCount } = await useArtifact(root, {
    artifact,
    parent,
    dirName,
    pkgName,
  })
  console.log(
    chalk.green(`✔ 已安装 "${artifact}" 到 ${path}(${fileCount} 个文件),包名已更新为 "${pkgName}"`),
  )
}

async function runList(): Promise<void> {
  const { root } = readWorkspace()
  const artifacts = await listArtifacts(root)
  if (!artifacts.length) {
    console.log(chalk.yellow('还没有制品,请先执行 template add'))
    return
  }

  console.log(chalk.bold(`共 ${artifacts.length} 个制品:`))
  for (const item of artifacts) {
    const time = item.mtime.toLocaleString('zh-CN', { hour12: false })
    console.log(
      `  ${chalk.green(item.name)}  ${chalk.gray(formatSize(item.size))}  ${chalk.gray(time)}`,
    )
  }
}

// ---------- 工具函数 ----------

function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 ** 2) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
