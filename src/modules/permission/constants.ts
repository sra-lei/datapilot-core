/**
 * 权限管理模块 - 常量定义
 */

export const PERMISSION_MESSAGES = {
  // 权限操作
  PERMISSION_CREATED: '权限创建成功',
  PERMISSION_UPDATED: '权限更新成功',
  PERMISSION_DELETED: '权限删除成功',
  PERMISSION_NOT_FOUND: '权限不存在',
  PERMISSION_ALREADY_EXISTS: '权限已存在',

  // 角色操作
  ROLE_CREATED: '角色创建成功',
  ROLE_UPDATED: '角色更新成功',
  ROLE_DELETED: '角色删除成功',
  ROLE_NOT_FOUND: '角色不存在',
  ROLE_ALREADY_EXISTS: '角色已存在',

  // 授权操作
  PERMISSION_GRANTED: '权限授予成功',
  PERMISSION_REVOKED: '权限撤销成功',
  ROLE_ASSIGNED: '角色分配成功',
  ROLE_REVOKED: '角色撤销成功',

  // 用户权限
  USER_PERMISSIONS_LOADED: '用户权限加载成功',
  ROLE_PERMISSIONS_LOADED: '角色权限加载成功',

  // 通用
  INVALID_PARAMS: '参数错误',
  OPERATION_FAILED: '操作失败',
} as const;

export const DEFAULT_PERMISSIONS = [
  // 用户管理权限
  { name: 'user:read', description: '查看用户' },
  { name: 'user:create', description: '创建用户' },
  { name: 'user:update', description: '更新用户' },
  { name: 'user:delete', description: '删除用户' },

  // 角色管理权限
  { name: 'role:read', description: '查看角色' },
  { name: 'role:create', description: '创建角色' },
  { name: 'role:update', description: '更新角色' },
  { name: 'role:delete', description: '删除角色' },
  { name: 'role:assign', description: '分配角色' },

  // 数据库管理权限
  { name: 'database:read', description: '查看数据库' },
  { name: 'database:query', description: '执行查询' },

  // 系统管理权限
  { name: 'system:settings', description: '系统设置' },

  // 文档入库权限（入库人员；评估集生成属于 eval 域，走 eval:write）
  { name: 'doc:ingest', description: '文档入库' },
] as const;

export const DEFAULT_ROLES = [
  {
    name: 'admin',
    description: '系统管理员，拥有所有权限',
    permissions: ['*'], // * 表示所有权限
  },
  {
    name: 'user',
    description: '普通用户，拥有基础权限',
    permissions: ['user:read', 'database:read'],
  },
  {
    name: 'developer',
    description: '开发人员，拥有数据库查询权限',
    permissions: ['user:read', 'database:read', 'database:query'],
  },
] as const;
