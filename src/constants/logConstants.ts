/**
 * 日志模块常量
 */

export const LOG_FILES = {
  COMBINED: 'logs/combined.log',
  ERROR: 'logs/error.log',
  USER: 'logs/user.log',
} as const;

export const LOG_CONFIG = {
  MAX_SIZE: 5242880,
  MAX_FILES: 10,
  DEFAULT_LEVEL: 'info',
  TIMESTAMP_FORMAT: 'YYYY-MM-DD HH:mm:ss.SSS',
} as const;

export const LOG_OPERATIONS = {
  // 用户操作
  USER_REGISTER: 'USER_REGISTER',
  USER_LOGIN: 'USER_LOGIN',
  USER_LOGOUT: 'USER_LOGOUT',
  USER_CHANGE_PASSWORD: 'USER_CHANGE_PASSWORD',
  USER_GET_INFO: 'USER_GET_INFO',
  USER_UPDATE_INFO: 'USER_UPDATE_INFO',

  // 数据库操作
  DB_INIT: 'DB_INIT',
  DB_QUERY: 'DB_QUERY',
  DB_INSERT: 'DB_INSERT',
  DB_UPDATE: 'DB_UPDATE',
  DB_DELETE: 'DB_DELETE',

  // 系统操作
  SERVER_START: 'SERVER_START',
  SERVER_STOP: 'SERVER_STOP',
  SERVER_ERROR: 'SERVER_ERROR',

  // 通用操作
  REQUEST: 'REQUEST',
  VALIDATION: 'VALIDATION',
} as const;