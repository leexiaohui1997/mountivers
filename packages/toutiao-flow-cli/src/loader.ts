import { readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { getCommands, getGroup, type CmdMeta } from './metadata.js'

import type { Command as CommanderCommand } from 'commander'

const COMMAND_SUFFIX = '.command'
const currentExt = import.meta.url.endsWith('.ts') ? '.ts' : '.js'

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      walk(full, out)
    } else if (entry.endsWith(`${COMMAND_SUFFIX}${currentExt}`)) {
      out.push(full)
    }
  }
  return out
}

type CommandInstance = new () => Record<string, (...args: unknown[]) => unknown>

function bindAction(
  commander: CommanderCommand,
  Cls: CommandInstance,
  method: string,
  meta: CmdMeta,
): void {
  // action 实参:位置参数(按声明顺序)在前,Command 实例在末位。
  commander.action(async (...commanderArgs: unknown[]) => {
    const positional = commanderArgs.slice(0, -1) as unknown[]
    const cmd = commanderArgs[commanderArgs.length - 1] as CommanderCommand
    const opts = cmd.opts()

    // @Arg 形参按 parameterIndex 从 positional 取值,其余(opts 形参)整体直传。
    const ordered = [...meta.args].sort((a, b) => a.index - b.index)
    const callArgs: unknown[] = ordered.map((a) => positional[a.index])
    callArgs.push(opts)

    const instance = new Cls()
    await (instance[method] as (...args: unknown[]) => unknown)(...callArgs)
  })
}

function applyCommand(
  parent: CommanderCommand,
  Cls: CommandInstance,
  method: string,
  meta: CmdMeta,
): void {
  const copts = meta.commandOpts ?? {}
  const sub = parent
    .command(meta.name, {
      hidden: copts.hidden,
      isDefault: copts.isDefault,
    })
    .description(meta.description ?? '')

  for (const a of meta.args) {
    const def = a.opts?.default as string | boolean | string[] | undefined
    if (a.opts?.coercion !== undefined) {
      sub.argument(a.spec, a.description ?? '', a.opts.coercion, def)
    } else {
      sub.argument(a.spec, a.description ?? '', def)
    }
  }
  for (const o of meta.options) {
    const def = o.opts?.default as string | boolean | string[] | undefined
    if (o.opts?.coercion !== undefined) {
      sub.option(o.flags, o.description ?? '', o.opts.coercion, def)
    } else {
      sub.option(o.flags, o.description ?? '', def)
    }
  }
  if (copts.aliases) sub.aliases(Array.isArray(copts.aliases) ? copts.aliases : [copts.aliases])
  if (copts.allowUnknownOption) sub.allowUnknownOption(copts.allowUnknownOption)
  if (copts.exitOverride) sub.exitOverride()

  bindAction(sub, Cls, method, meta)
}

/**
 * 扫描 commands/ 下所有 *.command.{ts,js},自动装配到 program。
 * @param program commander 根实例
 * @param commandsDir 命令目录(默认 commands/,相对 loader 所在目录)
 */
export async function loadCommands(
  program: CommanderCommand,
  commandsDir = join(dirname(fileURLToPath(import.meta.url)), 'commands'),
): Promise<void> {
  const groups = new Map<string, CommanderCommand>()
  const files = walk(commandsDir)

  for (const file of files) {
    const mod = await import(pathToFileURL(file).href)
    const Cls = mod.default
    if (!Cls || typeof Cls !== 'function') continue

    const group = getGroup(Cls.prototype)
    const cmds = getCommands(Cls.prototype)
    if (!cmds || cmds.size === 0) continue

    const path = group?.path ?? ''
    let parent: CommanderCommand
    if (path) {
      const existing = groups.get(path)
      parent =
        existing ??
        (() => {
          const cmd = program.command(path)
          if (group?.description) cmd.description(group.description)
          groups.set(path, cmd)
          return cmd
        })()
    } else {
      parent = program
    }

    for (const [method, meta] of cmds) {
      applyCommand(parent, Cls, method, meta)
    }
  }
}
