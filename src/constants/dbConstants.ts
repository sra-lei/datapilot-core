/**
 * 数据库模块常量
 */

export const DB_CONFIG = {
  DEFAULT_PORT: 3002,
} as const;

export const DB_ERRORS = {
  DUPLICATE_ENTRY: 'ER_DUP_ENTRY',
  NOT_INITIALIZED: 'Database not initialized',
} as const;

export const DB_ADAPTER_NAMES = {
  MYSQL: 'MySQL',
} as const;