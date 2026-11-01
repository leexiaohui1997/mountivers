import { spawn } from 'node:child_process'

import { TaskQueue } from './task-queue.js'

/** 串行执行 wtx 的构建和部署，避免多个角色同时写 dist */
export const wtxDeployQueue = new TaskQueue(
  {
    onStart: (label, pending) => {
      console.log(`[wtx-deploy] ▶ ${label} 开始${pending ? `（排队 ${pending}）` : ''}`)
    },
    onFinish: (label, durationMs, error) => {
      console.log(
        `[wtx-deploy] ${error ? '✗' : '✓'} ${label} ${durationMs}ms${
          error ? ` - ${error instanceof Error ? error.message : String(error)}` : ''
        }`,
      )
    },
  },
  { collectWindowMs: 300 },
)

/** 排队执行 wtx 构建和部署 */
export async function enqueueWtxBuildDeploy(
  label: string,
  wtxPath: string,
  pnpmCommand: string,
): Promise<void> {
  await wtxDeployQueue.run(
    label,
    async () => {
      await runCommand(pnpmCommand, ['run', 'build'], wtxPath)
      await runCommand(pnpmCommand, ['run', 'deploy'], wtxPath)
    },
    0,
  )
}

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log(`[wtx-deploy] 执行: ${command} ${args.join(' ')} (cwd=${cwd})`)

    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${command} ${args.join(' ')} 退出码 ${code ?? 'unknown'}`))
      }
    })
  })
}
