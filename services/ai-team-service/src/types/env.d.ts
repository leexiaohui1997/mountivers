declare namespace NodeJS {
  interface CustomEnv {
    PORT?: string
    NODE_ENV?: 'development' | 'production'
    DATABASE_URL?: string
    REDIS_URL?: string
    ACCESS_TOKEN_SECRET?: string
    REFRESH_TOKEN_SECRET?: string
  }

  type ProcessEnv = CustomEnv
}
