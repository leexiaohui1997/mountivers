import { ApiCode, UserSchema } from '@mountivers/ai-team-shared'
import { Router } from 'express'

import { prisma } from '@/utils/db.js'
import { successLog } from '@/utils/log.js'
import { hashPassword } from '@/utils/password.js'

export const adminRouter: Router = Router()

adminRouter.post('/init', async (req, res) => {
  const adminCount = await prisma.user.count({ where: { isAdmin: true } })
  if (adminCount > 0) {
    return res.status(201).json({
      code: ApiCode.SUCCESS,
      message: '已存在管理员',
    })
  }

  const data = UserSchema.parse(req.body)
  const hashedPassword = await hashPassword(data.password)

  const adminInfo = await prisma.user.create({
    data: {
      username: data.username,
      password: hashedPassword,
      isAdmin: true,
    },
  })

  successLog('设置初始管理员成功', `${adminInfo.username} [${adminInfo.id}]`)

  res.status(201).json({
    code: ApiCode.SUCCESS,
    message: '设置初始管理员成功',
  })
})
