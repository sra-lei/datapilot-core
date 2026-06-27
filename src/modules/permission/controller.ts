/**
 * 权限管理模块 - 控制器
 */

import { Request, Response } from 'express';
import { permissionService } from './service';
import { success, error } from '../../utils/response';

export class PermissionController {
  // ==================== 权限管理 ====================

  /**
   * 获取所有权限
   * GET /api/permission/permissions
   */
  async getAllPermissions(_req: Request, res: Response): Promise<void> {
    const result = await permissionService.getAllPermissions();

    if (result.success) {
      success(res, result.data, '获取权限列表成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 创建权限
   * POST /api/permission/permissions
   */
  async createPermission(req: Request, res: Response): Promise<void> {
    const { name, description } = req.body;

    if (!name) {
      error(res, 400, '权限名称不能为空');
      return;
    }

    const result = await permissionService.createPermission({ name, description });

    if (result.success) {
      success(res, result.data, '创建权限成功', 201);
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 删除权限
   * DELETE /api/permission/permissions/:id
   */
  async deletePermission(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id as string);

    if (isNaN(id)) {
      error(res, 400, '无效的权限ID');
      return;
    }

    const result = await permissionService.deletePermission(id);

    if (result.success) {
      success(res, null, '删除权限成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  // ==================== 角色管理 ====================

  /**
   * 获取所有角色
   * GET /api/permission/roles
   */
  async getAllRoles(_req: Request, res: Response): Promise<void> {
    const result = await permissionService.getAllRoles();

    if (result.success) {
      success(res, result.data, '获取角色列表成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 获取角色详情（包括权限）
   * GET /api/permission/roles/:id
   */
  async getRoleWithPermissions(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id as string);

    if (isNaN(id)) {
      error(res, 400, '无效的角色ID');
      return;
    }

    const result = await permissionService.getRoleWithPermissions(id);

    if (result.success) {
      success(res, result.data, '获取角色详情成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 创建角色
   * POST /api/permission/roles
   */
  async createRole(req: Request, res: Response): Promise<void> {
    const { name, description } = req.body;

    if (!name) {
      error(res, 400, '角色名称不能为空');
      return;
    }

    const result = await permissionService.createRole({ name, description });

    if (result.success) {
      success(res, result.data, '创建角色成功', 201);
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 更新角色
   * PUT /api/permission/roles/:id
   */
  async updateRole(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id as string);
    const { name, description } = req.body;

    if (isNaN(id)) {
      error(res, 400, '无效的角色ID');
      return;
    }

    if (!name) {
      error(res, 400, '角色名称不能为空');
      return;
    }

    const result = await permissionService.updateRole(id, { name, description });

    if (result.success) {
      success(res, result.data, '更新角色成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 删除角色
   * DELETE /api/permission/roles/:id
   */
  async deleteRole(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id as string);

    if (isNaN(id)) {
      error(res, 400, '无效的角色ID');
      return;
    }

    const result = await permissionService.deleteRole(id);

    if (result.success) {
      success(res, null, '删除角色成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  // ==================== 授权管理 ====================

  /**
   * 为角色授予权限
   * POST /api/permission/roles/:id/permissions
   */
  async grantPermission(req: Request, res: Response): Promise<void> {
    const roleId = parseInt(req.params.id as string);
    const { permissionId } = req.body;

    if (isNaN(roleId)) {
      error(res, 400, '无效的角色ID');
      return;
    }

    if (!permissionId) {
      error(res, 400, '权限ID不能为空');
      return;
    }

    const result = await permissionService.grantPermission({
      roleId,
      permissionId: parseInt(permissionId as string),
    });

    if (result.success) {
      success(res, null, '授予权限成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 撤销角色权限
   * DELETE /api/permission/roles/:roleId/permissions/:permissionId
   */
  async revokePermission(req: Request, res: Response): Promise<void> {
    const roleId = parseInt(req.params.roleId as string);
    const permissionId = parseInt(req.params.permissionId as string);

    if (isNaN(roleId) || isNaN(permissionId)) {
      error(res, 400, '无效的角色ID或权限ID');
      return;
    }

    const result = await permissionService.revokePermission(roleId, permissionId);

    if (result.success) {
      success(res, null, '撤销权限成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 为用户分配角色
   * POST /api/permission/users/:userId/roles
   */
  async assignRole(req: Request, res: Response): Promise<void> {
    const userId = parseInt(req.params.userId as string);
    const { roleId } = req.body;

    if (isNaN(userId)) {
      error(res, 400, '无效的用户ID');
      return;
    }

    if (!roleId) {
      error(res, 400, '角色ID不能为空');
      return;
    }

    const result = await permissionService.assignRole({
      userId,
      roleId: parseInt(roleId as string),
    });

    if (result.success) {
      success(res, null, '分配角色成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 撤销用户角色
   * DELETE /api/permission/users/:userId/roles/:roleId
   */
  async revokeRole(req: Request, res: Response): Promise<void> {
    const userId = parseInt(req.params.userId as string);
    const roleId = parseInt(req.params.roleId as string);

    if (isNaN(userId) || isNaN(roleId)) {
      error(res, 400, '无效的用户ID或角色ID');
      return;
    }

    const result = await permissionService.revokeRole(userId, roleId);

    if (result.success) {
      success(res, null, '撤销角色成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 获取用户的角色和权限
   * GET /api/permission/users/:userId/permissions
   */
  async getUserPermissions(req: Request, res: Response): Promise<void> {
    const userId = parseInt(req.params.userId as string);

    if (isNaN(userId)) {
      error(res, 400, '无效的用户ID');
      return;
    }

    const result = await permissionService.getUserPermissions(userId);

    if (result.success) {
      success(res, result.data, '获取用户权限成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }
}

// 导出单例
export const permissionController = new PermissionController();
