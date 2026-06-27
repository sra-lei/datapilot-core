/**
 * 全局类型定义
 */

import { ErrorCode } from './errorConstants';

/**
 * 服务层返回结果
 */
export interface ServiceResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: ErrorCode;
    message: string;
  };
}