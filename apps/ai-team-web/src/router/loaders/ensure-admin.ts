import { redirect, type LoaderFunction } from 'react-router'

import { checkHealth } from '@/api/utils'

// 路由白名单
const whiteList = ['/init/admin']
let checkPassed = false

export const ensureAdminLoader: LoaderFunction = async ({ pattern }) => {
  if (checkPassed || whiteList.some((p) => pattern.startsWith(p))) {
    return null
  }

  try {
    await checkHealth()
    checkPassed = true
  } catch {
    return redirect('/init/admin')
  }
}
