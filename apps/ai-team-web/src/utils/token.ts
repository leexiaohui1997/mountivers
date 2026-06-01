export const ACCESS_TOKEN_KEY = 'accessToken'
export const REFRESH_TOKEN_KEY = 'refreshToken'

export interface TokenType {
  accessToken: string
  refreshToken: string
}

export function setTokens(tokens: TokenType) {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.accessToken)
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken)
}

export function cleanTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY) ?? ''
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_TOKEN_KEY) ?? ''
}
