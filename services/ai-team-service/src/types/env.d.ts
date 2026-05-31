declare namespace NodeJS {
  interface CustomEnv {
    PORT?: string
    NODE_ENV?: 'development' | 'production'
    DATABASE_URL?: string
    REDIS_URL?: string
  }

  type ProcessEnv = CustomEnv
}
