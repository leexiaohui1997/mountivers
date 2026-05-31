export enum ApiCode {
  // 成功
  SUCCESS = 0,
  // 未知错误
  UNKNOWN_ERROR = 1,

  // 参数错误
  PARAM_ERROR = 400,
  // 未授权
  UNAUTHORIZED = 401,

  // 系统未初始化
  SYSTEM_NOT_INITIALIZED = 1000,
  // 管理员未初始化
  ADMIN_NOT_INITIALIZED = 1001,

  // 刷新令牌无效
  INVALID_REFRESH_TOKEN = 2000,
  // 访问令牌无效
  INVALID_ACCESS_TOKEN = 2001,

  // 用户不存在
  USER_NOT_FOUND = 3000,
  // 密码错误
  INVALID_PASSWORD = 3001,
}

export const ApiCodeMsg: Record<ApiCode, string> = {
  [ApiCode.SUCCESS]: '成功',
  [ApiCode.UNKNOWN_ERROR]: '未知错误',
  [ApiCode.PARAM_ERROR]: '参数错误',
  [ApiCode.UNAUTHORIZED]: '未授权',
  [ApiCode.SYSTEM_NOT_INITIALIZED]: '系统未初始化',
  [ApiCode.ADMIN_NOT_INITIALIZED]: '管理员未初始化',
  [ApiCode.INVALID_REFRESH_TOKEN]: '刷新令牌无效',
  [ApiCode.INVALID_ACCESS_TOKEN]: '访问令牌无效',
  [ApiCode.USER_NOT_FOUND]: '用户不存在',
  [ApiCode.INVALID_PASSWORD]: '密码错误',
}

export interface ApiResponse<T = unknown> {
  code: ApiCode
  message: string
  data: T
}
