import { setCommand, type CommandOpts } from '../metadata.js'

/**
 * 作用于「类的方法」,将该方法注册为一个子命令。
 * 执行时机晚于 @Arg / @Option,负责把暂存的参数与选项合并成命令元数据。
 * @param name 命令名。省略时取方法名。
 * @param description 描述。
 * @param commandOpts 透传给 commander 的命令选项(aliases / hidden / isDefault ...)。
 */
export function Command(
  name?: string,
  description?: string,
  commandOpts?: CommandOpts,
): MethodDecorator {
  return (proto, propertyKey) => {
    const method = String(propertyKey)
    setCommand(proto, method, {
      name: name ?? method,
      description,
      commandOpts,
    })
  }
}
