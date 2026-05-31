import type { User } from '@mountivers/ai-team-db'

declare global {
  namespace Express {
    interface Request {
      user: User
    }
  }
}
