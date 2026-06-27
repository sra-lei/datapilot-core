/**
 * 用户模块常量
 */

import { ErrorCode } from '../../constants';
import { UserStatus } from './types';

export { ErrorCode, UserStatus };

// 用户操作类型
export type UserOperationType = 'USER_REGISTER' | 'USER_LOGIN' | 'USER_CHANGE_PASSWORD' | 'USER_UPDATE_STATUS' | 'USER_DELETE';

export const MESSAGES = {
  SUCCESS: '操作成功',
  ALL_FIELDS_REQUIRED: '所有字段都不能为空',
  USER_NOT_FOUND: '用户不存在',
  USER_ALREADY_EXISTS: '用户名已存在',
  PASSWORD_ERROR: '用户名或密码错误',
  OLD_PASSWORD_ERROR: '旧密码错误',
  GET_PERMISSION_FAILED: '获取用户权限失败，请稍后重试',
  USER_INACTIVE: '用户已被停用，无法登录',
  USER_DELETED: '用户已被删除',
  REGISTER_SUCCESS: '注册成功',
  LOGIN_SUCCESS: '登录成功',
  CHANGE_PASSWORD_SUCCESS: '密码修改成功',
  UPDATE_STATUS_SUCCESS: '状态更新成功',
  DELETE_SUCCESS: '删除成功（停用）',
  REGISTER_FAILED: '注册失败',
  LOGIN_FAILED: '登录失败',
  CHANGE_PASSWORD_FAILED: '修改密码失败',
  UPDATE_STATUS_FAILED: '更新状态失败',
  DELETE_FAILED: '删除失败',
} as const;

export const OPERATIONS = {
  USER_REGISTER: 'USER_REGISTER',
  USER_LOGIN: 'USER_LOGIN',
  USER_CHANGE_PASSWORD: 'USER_CHANGE_PASSWORD',
  USER_UPDATE_STATUS: 'USER_UPDATE_STATUS',
  USER_DELETE: 'USER_DELETE',
} as const;

export const USER_STATUS_LABELS = {
  [UserStatus.ACTIVE]: '启用',
  [UserStatus.INACTIVE]: '停用',
  [UserStatus.DELETED]: '已删除',
} as const;
