import { ApiCodeMsg, type ApiCode } from '../constants/api.js'

export class ApiError extends Error {
  constructor(
    public code: ApiCode,
    message = ApiCodeMsg[code],
  ) {
    super(message)
  }
}
