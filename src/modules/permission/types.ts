/**
 * 权限管理模块 - 类型定义
 */

import { ServiceResult } from "../../constants";

// 导出全局类型
export { ServiceResult };

export interface Permission {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface RolePermission {
  role_id: number;
  permission_id: number;
}

export interface UserRole {
  user_id: number;
  role_id: number;
}

export interface CreatePermissionParams {
  name: string;
  description?: string;
}

export interface CreateRoleParams {
  name: string;
  description?: string;
}

export interface AssignRoleParams {
  userId: number;
  roleId: number;
}

export interface GrantPermissionParams {
  roleId: number;
  permissionId: number;
}

export interface RoleWithPermissions extends Role {
  permissions: Permission[];
}

export interface UserWithRoles {
  id: number;
  username: string;
  email: string | null;
  roles: Role[];
  permissions: string[];
}

// 权限验证相关类型
export interface AuthUser {
  id: number;
  username: string;
  roles: string[];
  permissions: string[];
}
