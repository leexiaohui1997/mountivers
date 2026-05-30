import { getErrorMsg } from '@mountivers/ai-team-shared'

import { closeServer, startServer } from './server.js'
import { connectDB, disconnectDB } from './utils/db.js'
import { errorLog } from './utils/log.js'

let isShutdowning = false
async function shutdown() {
  if (isShutdowning) return
  try {
    isShutdowning = true
    await closeServer()
    await disconnectDB()
  } finally {
    isShutdowning = false
    process.exit(1)
  }
}

async function bootstrap() {
  try {
    await connectDB()
    await startServer()
    process.once('SIGINT', () => void shutdown())
    process.once('SIGTERM', () => void shutdown())
  } catch (err) {
    errorLog(getErrorMsg(err))
    await shutdown()
  }
}

bootstrap()
