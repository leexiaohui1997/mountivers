import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

const WORK_DIR = process.cwd()
const PACKAGES_DIRS = ['apps/', 'services/', 'packages/']

const hasFormatCommandCache = new Map()
const hasFormatCommand = (dir) => {
  if (hasFormatCommandCache.has(dir)) {
    return hasFormatCommandCache.get(dir)
  }

  try {
    const packageFile = resolve(WORK_DIR, dir, 'package.json')
    const packageJson = JSON.parse(readFileSync(packageFile, 'utf8'))
    if (packageJson.scripts?.['lint-staged:format']) {
      hasFormatCommandCache.set(dir, true)
      return true
    }
    hasFormatCommandCache.set(dir, false)
    return false
  } catch {
    hasFormatCommandCache.set(dir, false)
    return false
  }
}

const runSubPackageFormat = (files) => {
  const filters = new Set(
    files
      .map((file) => {
        const relativeFile = relative(WORK_DIR, file).replace(/\\/g, '/')
        if (PACKAGES_DIRS.some((dir) => relativeFile.startsWith(dir))) {
          const subPackageDir = `./${relativeFile.split('/').slice(0, 2).join('/')}`
          if (hasFormatCommand(subPackageDir)) {
            return `--filter ${subPackageDir}`
          }
        }
      })
      .filter(Boolean),
  )

  if (filters.size) {
    return `pnpm ${[...filters].join(' ')} run lint-staged:format`
  }

  return []
}

export default {
  '*': ['eslint --fix', 'prettier --write --ignore-unknown', runSubPackageFormat],
}
