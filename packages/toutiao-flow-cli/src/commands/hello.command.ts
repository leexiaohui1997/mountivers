import { Arg } from '../decorators/argument.js'
import { CommandGroup } from '../decorators/command-group.js'
import { Command } from '../decorators/command.js'
import { Option } from '../decorators/option.js'

@CommandGroup()
export default class HelloCommands {
  @Command('hello', '打招呼')
  @Option('--loud', '大声打招呼', { default: false })
  async hello(
    @Arg('[name]', '名字', { default: 'world' }) name: string,
    opts: unknown,
  ): Promise<void> {
    const { loud } = opts as { loud?: boolean }
    const greeting = `hello ${name}`
    console.log(loud ? greeting.toUpperCase() : greeting)
  }
}
