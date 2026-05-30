import z from 'zod'

export const UserSchema = z.object({
  username: z
    .string()
    .regex(/^[A-Za-z0-9-_]{8,20}$/, { message: '账号应由8-20位字母、数字、中划线或下划线组成' }),

  password: z
    .string()
    .regex(/^[A-Za-z0-9-_]{8,20}$/, { message: '密码应由8-20位字母、数字、中划线或下划线组成' }),
})

export const RegistSchema = UserSchema.extend({
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: '两次输入的密码不一致',
  path: ['confirmPassword'],
})
