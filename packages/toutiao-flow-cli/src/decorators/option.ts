import { addOption, type ParamOpts } from '../metadata.js'

/**
 * 作用于「方法」,声明一条选项。仅负责向 commander 注册(cmd.option),
 * 选项值由 commander 解析后经 cmd.opts() 整体直传给方法的 opts 形参,
 * 因此无需在此绑定具体形参或计算 key。
 * @param flags commander 语法:--env <env> 取值 / --watch 布尔自动推断。
 * @param description 描述。
 * @param opts default / coercion / choices / required。
 */
export function Option(flags: string, description?: string, opts?: ParamOpts): MethodDecorator {
  return (proto, propertyKey) => {
    addOption(proto, String(propertyKey), { flags, description, opts })
  }
}
