/**
 * 权限管理模块 - 服务层
 */

import { DatabaseFactory } from "../../database";
import { logger } from "../../utils/logUtils";
import { repairField } from "../../utils/textRepair";
import {
  DEFAULT_PERMISSIONS,
  DEFAULT_ROLES,
  PERMISSION_MESSAGES,
} from "./constants";
import {
  AssignRoleParams,
  CreatePermissionParams,
  CreateRoleParams,
  GrantPermissionParams,
  Permission,
  Role,
  RoleWithPermissions,
  ServiceResult,
  UserWithRoles,
} from "./types";

export class PermissionService {
  private db;

  constructor() {
    this.db = DatabaseFactory.getInstance();
  }

  /**
   * 初始化权限相关表
   * 编码安全：新表强制 ENGINE=InnoDB + DEFAULT CHARSET=utf8mb4，避免继承 MySQL 实例默认字符集（latin1/gbk）。
   */
  async initializeTables(): Promise<void> {
    // 创建权限表
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS permissions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建角色表
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS roles (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建角色-权限关联表
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id INT NOT NULL,
        permission_id INT NOT NULL,
        PRIMARY KEY (role_id, permission_id),
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
        FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建用户-角色关联表
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS user_roles (
        user_id INT NOT NULL,
        role_id INT NOT NULL,
        PRIMARY KEY (user_id, role_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 初始化默认权限和角色
    await this.initializeDefaultData();
  }

  /**
   * 初始化默认数据和权限
   */
  private async initializeDefaultData(): Promise<void> {
    // 检查并插入默认权限（确保所有权限都存在）
    for (const perm of DEFAULT_PERMISSIONS) {
      try {
        await this.db.insert(
          "INSERT IGNORE INTO permissions (name, description) VALUES (?, ?)",
          [perm.name, perm.description],
        );
      } catch (error) {
        // 忽略唯一约束冲突
      }
    }

    // 检查并插入默认角色
    for (const role of DEFAULT_ROLES) {
      try {
        await this.db.insert(
          "INSERT IGNORE INTO roles (name, description) VALUES (?, ?)",
          [role.name, role.description],
        );
      } catch (error) {
        // 忽略唯一约束冲突
      }
    }

    // 为admin角色授予所有权限
    const adminRole = await this.db.query(
      "SELECT id FROM roles WHERE name = ?",
      ["admin"],
    );
    if (adminRole.rows && adminRole.rows.length > 0) {
      const adminRoleId = (adminRole.rows[0] as any).id;
      const allPermissions = await this.db.query("SELECT id FROM permissions");

      if (allPermissions.rows) {
        for (const perm of allPermissions.rows) {
          try {
            await this.db.insert(
              "INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
              [adminRoleId, (perm as any).id],
            );
          } catch (error) {
            // 忽略唯一约束冲突
          }
        }
      }
    }

    // 为user角色授予基础权限
    const userRole = await this.db.query(
      "SELECT id FROM roles WHERE name = ?",
      ["user"],
    );
    if (userRole.rows && userRole.rows.length > 0) {
      const userRoleId = (userRole.rows[0] as any).id;
      const basicPermissions = ["user:read", "database:read"];

      for (const permName of basicPermissions) {
        const perm = await this.db.query(
          "SELECT id FROM permissions WHERE name = ?",
          [permName],
        );
        if (perm.rows && perm.rows.length > 0) {
          try {
            await this.db.insert(
              "INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
              [userRoleId, (perm.rows[0] as any).id],
            );
          } catch (error) {
            // 忽略唯一约束冲突
          }
        }
      }
    }

    // 为 Sra 用户分配管理员角色
    const sraUser = await this.db.query(
      "SELECT id FROM users WHERE username = ?",
      ["Sra"],
    );
    if (
      sraUser.rows &&
      sraUser.rows.length > 0 &&
      adminRole.rows &&
      adminRole.rows.length > 0
    ) {
      const sraUserId = (sraUser.rows[0] as any).id;
      const adminRoleId = (adminRole.rows[0] as any).id;
      try {
        await this.db.insert(
          "INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
          [sraUserId, adminRoleId],
        );
      } catch (error) {
        // 忽略唯一约束冲突
      }
    }
  }

  // ==================== 权限管理 ====================

  /**
   * 获取所有权限
   */
  async getAllPermissions(): Promise<ServiceResult<Permission[]>> {
    try {
      const result = await this.db.query(
        "SELECT * FROM permissions ORDER BY name",
      );
      return {
        success: true,
        // 历史遗留：MySQL 实例默认字符集非 UTF-8 / 连接层未强制 utf8mb4 时，
        // 初始插入的中文 description 会被"UTF-8 bytes → Latin-1 decode"错编码。
        // 这里统一无损修复，旧库也能正确显示中文。
        data: repairField(
          (result.rows || []) as unknown as Permission[],
          "description",
        ),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: PERMISSION_MESSAGES.OPERATION_FAILED,
        },
      };
    }
  }

  /**
   * 创建权限
   */
  async createPermission(
    params: CreatePermissionParams,
  ): Promise<ServiceResult<Permission>> {
    try {
      // 检查是否已存在
      const existing = await this.db.query(
        "SELECT id FROM permissions WHERE name = ?",
        [params.name],
      );
      if (existing.rows && existing.rows.length > 0) {
        return {
          success: false,
          error: {
            code: 409,
            message: PERMISSION_MESSAGES.PERMISSION_ALREADY_EXISTS,
          },
        };
      }

      const result = await this.db.insert(
        "INSERT INTO permissions (name, description) VALUES (?, ?)",
        [params.name, params.description || null],
      );

      const permission = await this.db.query(
        "SELECT * FROM permissions WHERE id = ?",
        [result.insertId],
      );
      return {
        success: true,
        data: permission.rows?.[0] as unknown as Permission,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: PERMISSION_MESSAGES.OPERATION_FAILED,
        },
      };
    }
  }

  /**
   * 删除权限
   */
  async deletePermission(id: number): Promise<ServiceResult<void>> {
    try {
      const result = await this.db.delete(
        "DELETE FROM permissions WHERE id = ?",
        [id],
      );
      if (!result.affectedRows || result.affectedRows === 0) {
        return {
          success: false,
          error: {
            code: 404,
            message: PERMISSION_MESSAGES.PERMISSION_NOT_FOUND,
          },
        };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: PERMISSION_MESSAGES.OPERATION_FAILED,
        },
      };
    }
  }

  // ==================== 角色管理 ====================

  /**
   * 获取所有角色
   */
  async getAllRoles(): Promise<ServiceResult<Role[]>> {
    try {
      const result = await this.db.query("SELECT * FROM roles ORDER BY name");
      return {
        success: true,
        data: repairField(
          (result.rows || []) as unknown as Role[],
          "description",
        ),
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: PERMISSION_MESSAGES.OPERATION_FAILED,
        },
      };
    }
  }

  /**
   * 获取角色详情（包括权限）
   */
  async getRoleWithPermissions(
    roleId: number,
  ): Promise<ServiceResult<RoleWithPermissions>> {
    try {
      const roleResult = await this.db.query(
        "SELECT * FROM roles WHERE id = ?",
        [roleId],
      );
      if (!roleResult.rows || roleResult.rows.length === 0) {
        return {
          success: false,
          error: {
            code: 404,
            message: PERMISSION_MESSAGES.ROLE_NOT_FOUND,
          },
        };
      }

      const permissionsResult = await this.db.query(
        `SELECT p.* FROM permissions p
         INNER JOIN role_permissions rp ON p.id = rp.permission_id
         WHERE rp.role_id = ?`,
        [roleId],
      );

      const role = repairField(
        [roleResult.rows[0] as unknown as Role],
        "description",
      )[0];
      const permissions = repairField(
        (permissionsResult.rows || []) as unknown as Permission[],
        "description",
      );

      return {
        success: true,
        data: {
          ...role,
          permissions,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: PERMISSION_MESSAGES.OPERATION_FAILED,
        },
      };
    }
  }

  /**
   * 创建角色
   */
  async createRole(params: CreateRoleParams): Promise<ServiceResult<Role>> {
    try {
      // 检查是否已存在
      const existing = await this.db.query(
        "SELECT id FROM roles WHERE name = ?",
        [params.name],
      );
      if (existing.rows && existing.rows.length > 0) {
        return {
          success: false,
          error: {
            code: 409,
            message: PERMISSION_MESSAGES.ROLE_ALREADY_EXISTS,
          },
        };
      }

      const result = await this.db.insert(
        "INSERT INTO roles (name, description) VALUES (?, ?)",
        [params.name, params.description || null],
      );

      const role = await this.db.query("SELECT * FROM roles WHERE id = ?", [
        result.insertId,
      ]);
      return {
        success: true,
        data: role.rows?.[0] as unknown as Role,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: PERMISSION_MESSAGES.OPERATION_FAILED,
        },
      };
    }
  }

  /**
   * 更新角色
   */
  async updateRole(
    roleId: number,
    params: CreateRoleParams,
  ): Promise<ServiceResult<Role>> {
    try {
      const result = await this.db.update(
        "UPDATE roles SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [params.name, params.description || null, roleId],
      );

      if (!result.affectedRows || result.affectedRows === 0) {
        return {
          success: false,
          error: {
            code: 404,
            message: PERMISSION_MESSAGES.ROLE_NOT_FOUND,
          },
        };
      }

      const role = await this.db.query("SELECT * FROM roles WHERE id = ?", [
        roleId,
      ]);
      return {
        success: true,
        data: role.rows?.[0] as unknown as Role,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: PERMISSION_MESSAGES.OPERATION_FAILED,
        },
      };
    }
  }

  /**
   * 删除角色
   */
  async deleteRole(id: number): Promise<ServiceResult<void>> {
    try {
      // 不能删除admin角色
      const role = await this.db.query("SELECT name FROM roles WHERE id = ?", [
        id,
      ]);
      if (
        role.rows &&
        role.rows.length > 0 &&
        (role.rows[0] as any).name === "admin"
      ) {
        return {
          success: false,
          error: {
            code: 403,
            message: "不能删除管理员角色",
          },
        };
      }

      const result = await this.db.delete("DELETE FROM roles WHERE id = ?", [
        id,
      ]);
      if (!result.affectedRows || result.affectedRows === 0) {
        return {
          success: false,
          error: {
            code: 404,
            message: PERMISSION_MESSAGES.ROLE_NOT_FOUND,
          },
        };
      }
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: PERMISSION_MESSAGES.OPERATION_FAILED,
        },
      };
    }
  }

  // ==================== 授权管理 ====================

  /**
   * 为角色授予权限
   */
  async grantPermission(
    params: GrantPermissionParams,
  ): Promise<ServiceResult<void>> {
    try {
      // 检查角色和权限是否存在
      const roleCheck = await this.db.query(
        "SELECT id FROM roles WHERE id = ?",
        [params.roleId],
      );
      const permCheck = await this.db.query(
        "SELECT id FROM permissions WHERE id = ?",
        [params.permissionId],
      );

      if (!roleCheck.rows || roleCheck.rows.length === 0) {
        return {
          success: false,
          error: {
            code: 404,
            message: PERMISSION_MESSAGES.ROLE_NOT_FOUND,
          },
        };
      }

      if (!permCheck.rows || permCheck.rows.length === 0) {
        return {
          success: false,
          error: {
            code: 404,
            message: PERMISSION_MESSAGES.PERMISSION_NOT_FOUND,
          },
        };
      }

      await this.db.insert(
        "INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
        [params.roleId, params.permissionId],
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: PERMISSION_MESSAGES.OPERATION_FAILED,
        },
      };
    }
  }

  /**
   * 撤销角色权限
   */
  async revokePermission(
    roleId: number,
    permissionId: number,
  ): Promise<ServiceResult<void>> {
    try {
      // 不能撤销admin角色的任何权限
      const roleCheck = await this.db.query(
        "SELECT name FROM roles WHERE id = ?",
        [roleId],
      );
      if (
        roleCheck.rows &&
        roleCheck.rows.length > 0 &&
        (roleCheck.rows[0] as any).name === "admin"
      ) {
        return {
          success: false,
          error: {
            code: 403,
            message: "不能撤销管理员角色的权限",
          },
        };
      }

      const result = await this.db.delete(
        "DELETE FROM role_permissions WHERE role_id = ? AND permission_id = ?",
        [roleId, permissionId],
      );

      if (!result.affectedRows || result.affectedRows === 0) {
        return {
          success: false,
          error: {
            code: 404,
            message: "权限关联不存在",
          },
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: PERMISSION_MESSAGES.OPERATION_FAILED,
        },
      };
    }
  }

  /**
   * 为用户分配角色
   */
  async assignRole(params: AssignRoleParams): Promise<ServiceResult<void>> {
    try {
      // 检查用户和角色是否存在
      const userCheck = await this.db.query(
        "SELECT id FROM users WHERE id = ?",
        [params.userId],
      );
      const roleCheck = await this.db.query(
        "SELECT id FROM roles WHERE id = ?",
        [params.roleId],
      );

      if (!userCheck.rows || userCheck.rows.length === 0) {
        return {
          success: false,
          error: {
            code: 404,
            message: "用户不存在",
          },
        };
      }

      if (!roleCheck.rows || roleCheck.rows.length === 0) {
        return {
          success: false,
          error: {
            code: 404,
            message: PERMISSION_MESSAGES.ROLE_NOT_FOUND,
          },
        };
      }

      await this.db.insert(
        "INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
        [params.userId, params.roleId],
      );

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: PERMISSION_MESSAGES.OPERATION_FAILED,
        },
      };
    }
  }

  /**
   * 撤销用户角色
   */
  async revokeRole(
    userId: number,
    roleId: number,
  ): Promise<ServiceResult<void>> {
    try {
      // 不能撤销用户的admin角色
      const roleCheck = await this.db.query(
        "SELECT name FROM roles WHERE id = ?",
        [roleId],
      );
      if (
        roleCheck.rows &&
        roleCheck.rows.length > 0 &&
        (roleCheck.rows[0] as any).name === "admin"
      ) {
        return {
          success: false,
          error: {
            code: 403,
            message: "不能撤销管理员角色",
          },
        };
      }

      const result = await this.db.delete(
        "DELETE FROM user_roles WHERE user_id = ? AND role_id = ?",
        [userId, roleId],
      );

      if (!result.affectedRows || result.affectedRows === 0) {
        return {
          success: false,
          error: {
            code: 404,
            message: "用户角色关联不存在",
          },
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: PERMISSION_MESSAGES.OPERATION_FAILED,
        },
      };
    }
  }

  // ==================== 用户权限查询 ====================

  /**
   * 获取用户的角色和权限
   */
  async getUserPermissions(
    userId: number,
  ): Promise<ServiceResult<UserWithRoles>> {
    try {
      // 获取用户信息
      const userResult = await this.db.query(
        "SELECT id, username, email FROM users WHERE id = ?",
        [userId],
      );
      if (!userResult.rows || userResult.rows.length === 0) {
        return {
          success: false,
          error: {
            code: 404,
            message: "用户不存在",
          },
        };
      }

      // 获取用户角色
      const rolesResult = await this.db.query(
        `SELECT r.* FROM roles r
         INNER JOIN user_roles ur ON r.id = ur.role_id
         WHERE ur.user_id = ?`,
        [userId],
      );

      // 获取用户权限（去重）
      const permissionsResult = await this.db.query(
        `SELECT DISTINCT p.name FROM permissions p
         INNER JOIN role_permissions rp ON p.id = rp.permission_id
         INNER JOIN user_roles ur ON rp.role_id = ur.role_id
         WHERE ur.user_id = ?`,
        [userId],
      );

      const permissions = (permissionsResult.rows || []).map(
        (row: any) => row.name,
      );

      return {
        success: true,
        data: {
          ...(userResult.rows[0] as any),
          roles: (rolesResult.rows || []) as unknown as Role[],
          permissions,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: PERMISSION_MESSAGES.OPERATION_FAILED,
        },
      };
    }
  }

  /**
   * 获取用户的所有权限（字符串数组）
   */
  async getUserPermissionList(userId: number): Promise<string[]> {
    try {
      const result = await this.db.query(
        `SELECT DISTINCT p.name FROM permissions p
         INNER JOIN role_permissions rp ON p.id = rp.permission_id
         INNER JOIN user_roles ur ON rp.role_id = ur.role_id
         WHERE ur.user_id = ?`,
        [userId],
      );

      return (result.rows || []).map((row: any) => row.name);
    } catch (error) {
      logger.error("获取用户权限列表失败", { error });
      return [];
    }
  }

  /**
   * 检查用户是否有指定权限
   */
  async hasPermission(userId: number, permission: string): Promise<boolean> {
    try {
      // 首先检查用户是否属于 admin 角色
      const isAdmin = await this.isUserAdmin(userId);
      if (isAdmin) {
        return true;
      }

      const permissions = await this.getUserPermissionList(userId);

      // 检查是否有 * (所有权限)
      if (permissions.includes("*")) {
        return true;
      }

      return permissions.includes(permission);
    } catch (error) {
      logger.error("检查权限失败", { error, userId, permission });
      return false;
    }
  }

  /**
   * 检查用户是否属于 admin 角色
   */
  private async isUserAdmin(userId: number): Promise<boolean> {
    try {
      const result = await this.db.query(
        `SELECT r.name FROM roles r
         INNER JOIN user_roles ur ON r.id = ur.role_id
         WHERE ur.user_id = ? AND r.name = 'admin'`,
        [userId],
      );

      return result.rows !== undefined && result.rows.length > 0;
    } catch (error) {
      logger.error("检查用户角色失败", { error, userId });
      return false;
    }
  }
}

// 导出单例
export const permissionService = new PermissionService();
