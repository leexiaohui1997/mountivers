export enum ApiCode {
  // 成功
  SUCCESS = 0,
  // 未知错误
  UNKNOWN_ERROR = 1,

  // 系统未初始化
  SYSTEM_NOT_INITIALIZED = 1000,
  // 管理员未初始化
  ADMIN_NOT_INITIALIZED = 1001,
}

export const ApiCodeMsg: Record<ApiCode, string> = {
  [ApiCode.SUCCESS]: '成功',
  [ApiCode.UNKNOWN_ERROR]: '未知错误',
  [ApiCode.SYSTEM_NOT_INITIALIZED]: '系统未初始化',
  [ApiCode.ADMIN_NOT_INITIALIZED]: '管理员未初始化',
}
