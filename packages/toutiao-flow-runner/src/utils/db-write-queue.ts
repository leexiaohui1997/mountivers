import { TaskQueue } from './task-queue.js'

import type { PrismaClient } from '@toutiao-flow/db'

const WRITE_METHODS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
])

/** 所有数据库写操作共用同一队列，避免并发写 SQLite */
export const dbWriteQueue = new TaskQueue(
  {
    onFinish: (label, durationMs, error) => {
      if (error) {
        console.error(
          `[db-write] ✗ ${label} ${durationMs}ms: ${
            error instanceof Error ? error.message : String(error)
          }`,
        )
      }
    },
  },
  { collectWindowMs: 0 },
)

function isModelDelegate(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { findMany?: unknown }).findMany === 'function'
  )
}

function createModelProxy(modelName: string, delegate: Record<string, unknown>): unknown {
  return new Proxy(delegate, {
    get(target, prop) {
      const value = Reflect.get(target, prop)
      if (typeof value !== 'function') return value

      const method = String(prop)
      if (WRITE_METHODS.has(method)) {
        return (...args: unknown[]) =>
          dbWriteQueue.run(`db:${modelName}.${method}`, () => value.apply(target, args))
      }

      return value.bind(target)
    },
  })
}

/**
 * 把 Prisma 的写方法统一包进 dbWriteQueue。
 * 读操作不排队；回调式 $transaction 作为一个整体排队。
 */
export function createQueuedPrismaClient<T extends PrismaClient>(base: T): T {
  const modelProxies = new Map<string, unknown>()

  return new Proxy(base, {
    get(target, prop, receiver) {
      if (prop === '$transaction') {
        return async (arg: unknown, opts?: unknown) => {
          if (typeof arg !== 'function') {
            throw new Error('dbWriteQueue 只支持回调式 prisma.$transaction')
          }

          return dbWriteQueue.run('db:transaction', () =>
            (target.$transaction as (fn: unknown, options?: unknown) => Promise<unknown>)(
              arg,
              opts,
            ),
          )
        }
      }

      if (prop === '$executeRaw' || prop === '$executeRawUnsafe') {
        return (...args: unknown[]) =>
          dbWriteQueue.run(`db:${String(prop)}`, () =>
            (target[prop] as (...args: unknown[]) => Promise<unknown>)(...args),
          )
      }

      if (typeof prop === 'string') {
        const delegate = Reflect.get(target, prop)
        if (isModelDelegate(delegate)) {
          let proxy = modelProxies.get(prop)
          if (!proxy) {
            proxy = createModelProxy(prop, delegate)
            modelProxies.set(prop, proxy)
          }
          return proxy
        }
      }

      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as T
}
