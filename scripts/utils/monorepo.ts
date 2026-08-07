import { basename } from 'node:path'

import { execa } from 'execa'

export interface PackageInfo {
  name: string
  path: string
  basename: string
}

interface PnpmListItem {
  name?: string
  path?: string
  version?: string
}

export async function listPackages(): Promise<PackageInfo[]> {
  const { stdout } = await execa`pnpm list -r --depth -1 --json`
  const items = JSON.parse(stdout) as PnpmListItem[]
  return items
    .filter(
      (item): item is PnpmListItem & { name: string; path: string } =>
        typeof item.name === 'string' && item.name.length > 0 && typeof item.path === 'string',
    )
    .map((item) => ({
      name: item.name,
      path: item.path,
      basename: basename(item.path),
    }))
}
