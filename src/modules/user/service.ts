/**
 * 用户服务层
 * 处理用户相关业务逻辑
 */

import { DatabaseFactory } from "../../database";
import { logger } from "../../utils";
import { permissionService } from "../permission";
import { MESSAGES } from "./constants";
import {
  ChangePasswordParams,
  ErrorCode,
  LoginParams,
  RegisterParams,
  ServiceResult,
  UserInfo,
  UserStatus,
} from "./types";

/**
 * 获取数据库适配器
 */
function getDb() {
  return DatabaseFactory.getInstance();
}

/**
 * 用户注册
 */
export async function register(
  params: RegisterParams,
): Promise<ServiceResult<UserInfo>> {
  try {
    const { username, password, email, roleId } = params;
    const db = getDb();

    const result = await db.insert(
      "INSERT INTO users (username, password, email, status) VALUES (?, ?, ?, ?)",
      [username, password, email || null, UserStatus.ACTIVE],
    );

    const userId = result.insertId!;

    // 如果指定了角色ID，则为用户分配角色
    if (roleId) {
      await permissionService.assignRole({ userId, roleId });
    }

    return {
      success: true,
      data: {
        id: userId,
        username,
        email: email || null,
        status: UserStatus.ACTIVE,
      },
    };
  } catch (err: unknown) {
    const error = err as { message?: string };
    if (error.message === "ER_DUP_ENTRY") {
      return {
        success: false,
        error: {
          code: ErrorCode.CONFLICT,
          message: MESSAGES.USER_ALREADY_EXISTS,
        },
      };
    }

    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: MESSAGES.REGISTER_FAILED,
      },
    };
  }
}

/**
 * 用户登录
 */
export async function login(
  params: LoginParams,
): Promise<
  ServiceResult<UserInfo & { roles?: string[]; permissions?: string[] }>
> {
  try {
    const { username, password } = params;
    const db = getDb();

    const result = await db.query(
      "SELECT id, username, email, status FROM users WHERE username = ? AND password = ?",
      [username, password],
    );

    if (!result.rows || result.rows.length === 0) {
      return {
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: MESSAGES.PASSWORD_ERROR,
        },
      };
    }

    const user = result.rows[0] as unknown as UserInfo & { status?: string };

    // 确保用户有默认状态
    if (!user.status) {
      user.status = UserStatus.ACTIVE;
    }

    // 检查用户状态
    if (user.status === UserStatus.INACTIVE) {
      return {
        success: false,
        error: {
          code: ErrorCode.FORBIDDEN,
          message: MESSAGES.USER_INACTIVE,
        },
      };
    }

    if (user.status === UserStatus.DELETED) {
      return {
        success: false,
        error: {
          code: ErrorCode.FORBIDDEN,
          message: MESSAGES.USER_DELETED,
        },
      };
    }

    // 获取用户的角色和权限
    const permResult = await permissionService.getUserPermissions(user.id);
    let roles: string[] = [];
    let permissions: string[] = [];

    if (permResult.success && permResult.data) {
      roles = permResult.data.roles.map((r) => r.name);
      permissions = permResult.data.permissions;
    } else {
      // 获取权限失败时返回登录错误，避免默认赋予高权限
      return {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: MESSAGES.GET_PERMISSION_FAILED,
        },
      };
    }

    return {
      success: true,
      data: {
        ...user,
        roles,
        permissions,
      },
    };
  } catch (_err: unknown) {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: MESSAGES.LOGIN_FAILED,
      },
    };
  }
}

/**
 * 修改密码
 */
export async function changePassword(
  params: ChangePasswordParams,
): Promise<ServiceResult> {
  try {
    const { username, oldPassword, newPassword } = params;
    const db = getDb();

    // 验证旧密码
    const result = await db.query(
      "SELECT id FROM users WHERE username = ? AND password = ?",
      [username, oldPassword],
    );

    if (!result.rows || result.rows.length === 0) {
      return {
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: MESSAGES.OLD_PASSWORD_ERROR,
        },
      };
    }

    // 更新密码
    await db.update("UPDATE users SET password = ? WHERE username = ?", [
      newPassword,
      username,
    ]);

    return { success: true };
  } catch (_err: unknown) {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: MESSAGES.CHANGE_PASSWORD_FAILED,
      },
    };
  }
}

/**
 * 修改密码（管理员强制修改，不需要原密码）
 */
export async function updatePassword(params: {
  username: string;
  newPassword: string;
}): Promise<ServiceResult> {
  try {
    const { username, newPassword } = params;
    const db = getDb();

    // 更新密码
    const result = await db.update(
      "UPDATE users SET password = ? WHERE username = ?",
      [newPassword, username],
    );

    if (result.affectedRows === 0) {
      return {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: MESSAGES.USER_NOT_FOUND,
        },
      };
    }

    return { success: true };
  } catch (_err: unknown) {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: MESSAGES.CHANGE_PASSWORD_FAILED,
      },
    };
  }
}

/**
 * 根据ID获取用户信息
 */
export async function getUserById(
  userId: number,
): Promise<ServiceResult<UserInfo>> {
  try {
    const db = getDb();

    const result = await db.query(
      "SELECT id, username, email, status FROM users WHERE id = ?",
      [userId],
    );

    if (!result.rows || result.rows.length === 0) {
      return {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: MESSAGES.USER_NOT_FOUND,
        },
      };
    }

    return {
      success: true,
      data: result.rows[0] as unknown as UserInfo,
    };
  } catch (_err: unknown) {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "获取用户信息失败",
      },
    };
  }
}

/**
 * 更新用户状态
 */
export async function updateUserStatus(params: {
  userId: number;
  status: UserStatus;
}): Promise<ServiceResult> {
  try {
    const { userId, status } = params;
    const db = getDb();

    // 检查用户是否存在
    const userCheck = await db.query(
      "SELECT id, username FROM users WHERE id = ?",
      [userId],
    );
    if (!userCheck.rows || userCheck.rows.length === 0) {
      return {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: MESSAGES.USER_NOT_FOUND,
        },
      };
    }

    const username = (userCheck.rows[0] as any).username;

    // 不能修改管理员状态
    if (username === "Sra" || username === "admin") {
      return {
        success: false,
        error: {
          code: ErrorCode.FORBIDDEN,
          message: "不能修改管理员用户的状态",
        },
      };
    }

    // 更新用户状态 - 处理可能没有 updated_at 字段的情况
    let result;
    try {
      result = await db.update(
        "UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [status, userId],
      );
    } catch (error) {
      // 如果 updated_at 字段不存在，尝试只更新 status
      result = await db.update("UPDATE users SET status = ? WHERE id = ?", [
        status,
        userId,
      ]);
    }

    if (result.affectedRows === 0) {
      return {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: MESSAGES.USER_NOT_FOUND,
        },
      };
    }

    return { success: true };
  } catch (_err: unknown) {
    logger.error("更新用户状态失败", {
      error: _err,
      userId: params.userId,
      status: params.status,
    });
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: MESSAGES.UPDATE_STATUS_FAILED,
      },
    };
  }
}

/**
 * 删除用户（改为停用状态）
 */
export async function deleteUser(userId: number): Promise<ServiceResult> {
  try {
    const db = getDb();

    // 检查用户是否存在
    const userCheck = await db.query(
      "SELECT id, username FROM users WHERE id = ?",
      [userId],
    );
    if (!userCheck.rows || userCheck.rows.length === 0) {
      return {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: MESSAGES.USER_NOT_FOUND,
        },
      };
    }

    const username = (userCheck.rows[0] as any).username;

    // 不能删除管理员
    if (username === "Sra" || username === "admin") {
      return {
        success: false,
        error: {
          code: ErrorCode.FORBIDDEN,
          message: "不能删除管理员用户",
        },
      };
    }

    // 将用户状态改为 deleted（软删除）- 处理可能没有 updated_at 字段的情况
    let result;
    try {
      result = await db.update(
        "UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [UserStatus.DELETED, userId],
      );
    } catch (error) {
      // 如果 updated_at 字段不存在，尝试只更新 status
      result = await db.update("UPDATE users SET status = ? WHERE id = ?", [
        UserStatus.DELETED,
        userId,
      ]);
    }

    if (result.affectedRows === 0) {
      return {
        success: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: MESSAGES.USER_NOT_FOUND,
        },
      };
    }

    return { success: true };
  } catch (_err: unknown) {
    logger.error("删除用户失败", { error: _err, userId });
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: MESSAGES.DELETE_FAILED,
      },
    };
  }
}

/**
 * 获取用户列表
 */
export async function getUserList(): Promise<ServiceResult<UserInfo[]>> {
  try {
    const db = getDb();

    const result = await db.query(
      "SELECT id, username, email, status, created_at, updated_at FROM users ORDER BY id DESC",
      [],
    );

    return {
      success: true,
      data: (result.rows || []) as unknown as UserInfo[],
    };
  } catch (_err: unknown) {
    logger.error("获取用户列表失败", { error: _err });
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "获取用户列表失败",
      },
    };
  }
}
