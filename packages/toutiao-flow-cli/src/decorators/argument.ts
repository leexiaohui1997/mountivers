import { addArg, type ParamOpts } from '../metadata.js'

/**
 * 作用于方法「参数」,声明该形参为 commander 的位置参数。
 * 靠 parameterIndex 定位,因此 @Arg 形参需集中在方法签名前部。
 * @param spec commander 语法:<req> 必填 / [opt] 可选 / name... 变长。
 * @param description 描述。
 * @param opts default / coercion / choices / required。
 */
export function Arg(spec: string, description?: string, opts?: ParamOpts): ParameterDecorator {
  return (proto, method, index) => {
    addArg(proto, String(method), {
      index: index as number,
      spec,
      description,
      opts,
    })
  }
}
