import express from 'express'

import { PORT } from './utils/env.js'
import { successLog } from './utils/log.js'

import type { Server } from 'http'

export const app: express.Express = express()

let server: Server | null = null

export async function startServer() {
  await new Promise((resolve, reject) => {
    server = app.listen(PORT)
    server.once('error', reject)
    server.once('listening', () => {
      successLog(`服务已启动, 端口: ${PORT}`)
      server?.off('error', reject)
      resolve(null)
    })
  })
}

export async function closeServer() {
  await new Promise((resolve, reject) => {
    if (!server) {
      resolve(null)
      return
    }

    server.close((err) => {
      if (err) {
        reject(err)
      } else {
        server = null
        resolve(null)
      }
    })
  })
}
