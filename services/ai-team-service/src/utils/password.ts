import argon2 from 'argon2'

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  })
}

export function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return argon2.verify(hashedPassword, password)
}
