/**
 * 用户模块类型定义
 */

import { ErrorCode, ServiceResult } from "../../constants";

// 导出全局类型供其他模块使用
export { ErrorCode, ServiceResult };

// 用户状态
export enum UserStatus {
  ACTIVE = "active", // 启用
  INACTIVE = "inactive", // 停用
  DELETED = "deleted", // 已删除
}

// 用户操作类型和消息定义在 constants.ts 中

// 用户注册参数
export interface RegisterParams {
  username: string;
  password: string;
  email?: string;
  roleId?: number;
}

// 用户登录参数
export interface LoginParams {
  username: string;
  password: string;
}

// 修改密码参数
export interface ChangePasswordParams {
  username: string;
  oldPassword: string;
  newPassword: string;
}

// 更新用户状态参数
export interface UpdateUserStatusParams {
  userId: number;
  status: UserStatus;
}

// 用户信息
export interface UserInfo {
  id: number;
  username: string;
  email: string | null;
  status: UserStatus;
}
