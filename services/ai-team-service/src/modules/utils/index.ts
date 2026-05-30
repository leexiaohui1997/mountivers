import { ApiCode } from '@mountivers/ai-team-shared'

import type { Express } from 'express'

export function useUtilsModule(app: Express) {
  app.get('/health', (_, res) => res.json({ code: ApiCode.SUCCESS }))
}
