/**
 * 权限验证中间件
 */

import { NextFunction, Request, Response } from "express";
import { permissionService } from "../modules/permission";
import { AuthUser } from "../modules/permission/types";
import { logger } from "../utils/logUtils";
import { error } from "../utils/response";

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * 验证用户是否已登录
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // 从请求头或session中获取用户信息
  // 这里假设前端会在请求头中传递 userId
  const userId = req.headers["x-user-id"];

  if (!userId) {
    error(res, 401, "请先登录");
    return;
  }

  // 将用户ID存储在请求对象中
  (req as any).userId = parseInt(userId as string);
  next();
}

/**
 * 验证用户是否有指定权限
 * @param permission 所需权限，如 'user:create'
 */
export function requirePermission(permission: string) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const userId = (req as any).userId || req.headers["x-user-id"];

    if (!userId) {
      error(res, 401, "请先登录");
      return;
    }

    try {
      const hasPermission = await permissionService.hasPermission(
        parseInt(userId as string),
        permission,
      );

      if (!hasPermission) {
        error(res, 403, "没有权限执行此操作");
        return;
      }

      next();
    } catch (err) {
      logger.error("权限验证失败", { error: err, userId, permission });
      res.status(500).json({
        code: 500,
        message: "权限验证失败",
      });
    }
  };
}

/**
 * 验证用户是否有任意一个指定权限
 * @param permissions 所需权限数组
 */
export function requireAnyPermission(permissions: string[]) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const userId = (req as any).userId || req.headers["x-user-id"];

    if (!userId) {
      error(res, 401, "请先登录");
      return;
    }

    try {
      const userPermissions = await permissionService.getUserPermissionList(
        parseInt(userId as string),
      );

      // 检查是否有 * (所有权限)
      if (
        userPermissions.includes("*") ||
        userPermissions.includes(permissions[0])
      ) {
        next();
        return;
      }

      const hasPermission = permissions.some((p) =>
        userPermissions.includes(p),
      );

      if (!hasPermission) {
        error(res, 403, "没有权限执行此操作");
        return;
      }

      next();
    } catch (err) {
      logger.error("权限验证失败", { error: err, userId, permissions });
      res.status(500).json({
        code: 500,
        message: "权限验证失败",
      });
    }
  };
}

/**
 * 加载用户权限信息到请求对象
 */
export async function loadUserPermissions(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.headers["x-user-id"];

  if (userId) {
    try {
      const userPermissions = await permissionService.getUserPermissions(
        parseInt(userId as string),
      );

      if (userPermissions.success && userPermissions.data) {
        req.user = {
          id: userPermissions.data.id,
          username: userPermissions.data.username,
          roles: userPermissions.data.roles.map((r) => r.name),
          permissions: userPermissions.data.permissions,
        };
      }
    } catch (err) {
      logger.error("加载用户权限失败", { error: err, userId });
    }
  }

  next();
}
