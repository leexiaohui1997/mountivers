import { ApiCode, ApiError } from '@mountivers/ai-team-shared'

import type { User, Prisma } from '@mountivers/ai-team-db'

import { prisma } from '@/utils/db.js'

export async function ensureUser(
  where: Prisma.UserWhereUniqueInput,
  errCode = ApiCode.USER_NOT_FOUND,
): Promise<User> {
  const user = await prisma.user.findUnique({ where })
  if (!user) throw new ApiError(errCode)
  return user
}
