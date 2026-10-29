// 轻量元数据存储:基于 WeakMap,零额外依赖。
//
// 设计要点(配合 @Arg / @Option / @Command 的协作时序):
//   - @Arg   作用于「方法参数」,持有 parameterIndex,推入 pending.args
//   - @Option 作用于「方法」,无 index,推入 pending.options
//   - @Command 作用于「方法」(在 @Arg 之后执行),把 pending 合并成 CmdMeta
//
// 选项值不经过本模块计算 key:commander 解析后通过 cmd.opts() 整体直传,
// 方法用一个 opts 形参接收,因此无需 camelize / bindName。

export interface ParamOpts {
  default?: unknown
  coercion?: (value: string) => unknown
  choices?: readonly string[]
  required?: boolean
}

/** 位置参数:标记在方法形参上,靠 parameterIndex 定位。 */
export interface ArgMeta {
  index: number
  spec: string
  description?: string
  opts?: ParamOpts
}

/** 选项声明:只负责让 loader 调用 cmd.option 注册,值由 commander 直传进 opts。 */
export interface OptMeta {
  flags: string
  description?: string
  opts?: ParamOpts
}

export interface CmdMeta {
  name: string
  description?: string
  args: ArgMeta[]
  options: OptMeta[]
  commandOpts?: CommandOpts
}

export interface CommandOpts {
  aliases?: string | string[]
  hidden?: boolean
  isDefault?: boolean
  allowUnknownOption?: boolean
  exitOverride?: boolean
  [key: string]: unknown
}

export interface GroupMeta {
  path: string
}

interface Pending {
  args: ArgMeta[]
  options: OptMeta[]
}

const groupStore = new WeakMap<object, GroupMeta>()
const cmdStore = new WeakMap<object, Map<string, CmdMeta>>()
const pending = new WeakMap<object, Map<string, Pending>>()

export function setGroup(proto: object, meta: GroupMeta): void {
  groupStore.set(proto, meta)
}

export function getGroup(proto: object): GroupMeta | undefined {
  return groupStore.get(proto)
}

export function addArg(proto: object, method: string, arg: ArgMeta): void {
  const pen = ensurePending(proto, method)
  pen.args.push(arg)
}

export function addOption(proto: object, method: string, option: OptMeta): void {
  const pen = ensurePending(proto, method)
  pen.options.push(option)
}

export function setCommand(
  proto: object,
  method: string,
  meta: { name: string; description?: string; commandOpts?: CommandOpts },
): void {
  const pen = pending.get(proto)?.get(method) ?? { args: [], options: [] }
  let methods = cmdStore.get(proto)
  if (!methods) {
    methods = new Map()
    cmdStore.set(proto, methods)
  }
  methods.set(method, { ...meta, args: pen.args, options: pen.options })
}

export function getCommands(proto: object): Map<string, CmdMeta> | undefined {
  return cmdStore.get(proto)
}

function ensurePending(proto: object, method: string): Pending {
  let methods = pending.get(proto)
  if (!methods) {
    methods = new Map()
    pending.set(proto, methods)
  }
  let pen = methods.get(method)
  if (!pen) {
    pen = { args: [], options: [] }
    methods.set(method, pen)
  }
  return pen
}
