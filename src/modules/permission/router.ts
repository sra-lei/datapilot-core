/**
 * 权限管理模块 - 路由
 * @swagger
 * tags:
 *   name: 权限管理
 *   description: 角色、权限和用户角色分配管理接口
 */

import { Router } from 'express';
import { permissionController } from './controller';

const router = Router();

/**
 * @swagger
 * /core/permission/permissions:
 *   get:
 *     summary: 获取所有权限
 *     tags: [权限管理]
 *     responses:
 *       200:
 *         description: 权限列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: number
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Permission'
 *   post:
 *     summary: 创建权限
 *     tags: [权限管理]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: 创建成功
 */
router.get('/permissions', (req, res) => permissionController.getAllPermissions(req, res));
router.post('/permissions', (req, res) => permissionController.createPermission(req, res));

/**
 * @swagger
 * /core/permission/permissions/{id}:
 *   delete:
 *     summary: 删除权限
 *     tags: [权限管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: 删除成功
 */
router.delete('/permissions/:id', (req, res) => permissionController.deletePermission(req, res));

/**
 * @swagger
 * /core/permission/roles:
 *   get:
 *     summary: 获取所有角色
 *     tags: [权限管理]
 *     responses:
 *       200:
 *         description: 角色列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: number
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Role'
 *   post:
 *     summary: 创建角色
 *     tags: [权限管理]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: 创建成功
 */
router.get('/roles', (req, res) => permissionController.getAllRoles(req, res));
router.post('/roles', (req, res) => permissionController.createRole(req, res));

/**
 * @swagger
 * /core/permission/roles/{id}:
 *   get:
 *     summary: 获取角色详情（包含权限）
 *     tags: [权限管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: 角色详情
 *   put:
 *     summary: 更新角色
 *     tags: [权限管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: 更新成功
 *   delete:
 *     summary: 删除角色
 *     tags: [权限管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: 删除成功
 */
router.get('/roles/:id', (req, res) => permissionController.getRoleWithPermissions(req, res));
router.put('/roles/:id', (req, res) => permissionController.updateRole(req, res));
router.delete('/roles/:id', (req, res) => permissionController.deleteRole(req, res));

/**
 * @swagger
 * /core/permission/roles/{id}/permissions:
 *   post:
 *     summary: 为角色分配权限
 *     tags: [权限管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - permissionId
 *             properties:
 *               permissionId:
 *                 type: number
 *     responses:
 *       200:
 *         description: 分配成功
 */
router.post('/roles/:id/permissions', (req, res) => permissionController.grantPermission(req, res));

/**
 * @swagger
 * /core/permission/roles/{roleId}/permissions/{permissionId}:
 *   delete:
 *     summary: 移除角色权限
 *     tags: [权限管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: number
 *       - in: path
 *         name: permissionId
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: 移除成功
 */
router.delete('/roles/:roleId/permissions/:permissionId', (req, res) => permissionController.revokePermission(req, res));

/**
 * @swagger
 * /core/permission/users/{userId}/roles:
 *   post:
 *     summary: 为用户分配角色
 *     tags: [权限管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: number
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - roleId
 *             properties:
 *               roleId:
 *                 type: number
 *     responses:
 *       200:
 *         description: 分配成功
 */
router.post('/users/:userId/roles', (req, res) => permissionController.assignRole(req, res));

/**
 * @swagger
 * /core/permission/users/{userId}/roles/{roleId}:
 *   delete:
 *     summary: 移除用户角色
 *     tags: [权限管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: number
 *       - in: path
 *         name: roleId
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: 移除成功
 */
router.delete('/users/:userId/roles/:roleId', (req, res) => permissionController.revokeRole(req, res));

/**
 * @swagger
 * /core/permission/users/{userId}/permissions:
 *   get:
 *     summary: 获取用户权限列表
 *     tags: [权限管理]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: 权限列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code:
 *                   type: number
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.get('/users/:userId/permissions', (req, res) => permissionController.getUserPermissions(req, res));

export default router;
