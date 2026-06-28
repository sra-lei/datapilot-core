/**
 * 错误码常量 - 全局定义
 */

export enum ErrorCode {
  SUCCESS = 200,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_ERROR = 500,
  SERVICE_UNAVAILABLE = 503,
}

/**
 * 消息常量 - 全局定义
 */
export const Messages = {
  SUCCESS: "操作成功",
  BAD_REQUEST: "请求参数错误",
  UNAUTHORIZED: "未授权访问",
  FORBIDDEN: "禁止访问",
  NOT_FOUND: "资源不存在",
  INTERNAL_ERROR: "服务器内部错误",
  SERVICE_UNAVAILABLE: "服务不可用",
  HEALTH_OK: "服务运行正常",
} as const;

export type MessageKey = keyof typeof Messages;
