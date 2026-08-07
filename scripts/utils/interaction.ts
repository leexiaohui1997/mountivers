import chalk from 'chalk'
import Enquirer from 'enquirer'

import type { PackageInfo } from './monorepo.ts'

export interface Choice<T extends string = string> {
  name: T
  message?: string
}

export async function select<T extends string = string>(
  message: string,
  choices: Array<Choice<T> | string>,
): Promise<T | undefined> {
  const normalized = choices.map<Choice<T>>((choice) =>
    typeof choice === 'string' ? { name: choice as T, message: choice } : choice,
  )
  if (normalized.length === 0) {
    return undefined
  }

  const { name } = await new Enquirer<{ name: string }>().prompt([
    {
      name: 'name',
      type: 'select',
      message,
      choices: normalized.map(({ name: choiceName, message: choiceMessage }) => ({
        name: choiceName,
        message: choiceMessage ?? chalk.green(choiceName),
      })),
    },
  ])

  return normalized.find((item) => item.name === name)?.name
}

export async function confirm(message: string, initial = false): Promise<boolean> {
  const { ok } = await new Enquirer<{ ok: boolean }>().prompt([
    {
      name: 'ok',
      type: 'confirm',
      message,
      initial,
    },
  ])
  return ok
}

export async function selectPackage(message: string, pkgs: PackageInfo[]) {
  const { name } = await new Enquirer<{ name: string }>().prompt([
    {
      name: 'name',
      type: 'select',
      message,
      choices: pkgs.map(({ name, path }) => ({
        name,
        message: `${chalk.green(name)} ${chalk.gray(path)}`,
      })),
    },
  ])

  return pkgs.find((item) => item.name === name)
}

export async function input(
  message: string,
  opts?: {
    initial?: string
    validate?: (value: string) => string | boolean | Promise<boolean | string>
  },
) {
  const { value } = await new Enquirer<{ value: string }>().prompt([
    {
      name: 'value',
      type: 'input',
      message,
      initial: opts?.initial,
      validate: opts?.validate,
    },
  ])
  return value
}
