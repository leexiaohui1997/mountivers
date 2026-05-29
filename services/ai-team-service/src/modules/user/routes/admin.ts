import { Router } from 'express'

export const adminRouter: Router = Router()

adminRouter.post('/create', async (_, res) => {
  // TODO: implement user creation logic
  res.status(201).json({ message: 'User created successfully' })
})
