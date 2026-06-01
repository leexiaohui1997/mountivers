import type { RouteHandle } from '.'
import type { UIMatch } from 'react-router'

/**
 * 检查匹配的路由是否满足条件
 * @param matches 匹配的路由
 * @param checkFn 检查函数
 * @param checkParent 是否检查父路由
 * @returns
 */
export function checkMatchHandle(
  matches: UIMatch[],
  checkFn: (handle: RouteHandle | undefined) => boolean,
  checkParent = false,
) {
  const targets = checkParent ? matches : [matches[matches.length - 1]]
  return targets.some((match) => checkFn(match.handle as RouteHandle))
}
