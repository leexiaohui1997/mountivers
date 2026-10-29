import { Command } from 'commander'

import { loadCommands } from './loader.js'

const program = new Command()

program.name('toutiao-flow').description('toutiao-flow 命令行工具').version('0.0.1')

await loadCommands(program)

program.parseAsync()
