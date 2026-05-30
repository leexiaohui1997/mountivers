import { ensureAdminLoader } from './ensure-admin'

import type { LoaderFunction } from 'react-router'

export const globalRouteLoader: LoaderFunction = async (args, ctx) => {
  return [ensureAdminLoader].reduce(async (acc: unknown, loader: LoaderFunction) => {
    const result = (await acc) ?? null
    return result ? result : loader(args, ctx)
  }, Promise.resolve(null))
}
