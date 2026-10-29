import { setGroup } from '../metadata.js'

/**
 * 作用于「类」,声明其下的 @Command 方法挂载在哪个命令组。
 * @param path 分组路径。为空字符串或省略时,命令直接挂载到根。
 */
export function CommandGroup(path = ''): ClassDecorator {
  return (target) => {
    setGroup(target.prototype, { path })
  }
}
