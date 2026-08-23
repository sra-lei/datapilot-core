/**
 * 评估集管理模块 - 路由
 * @swagger
 * tags:
 *   name: 评估集管理
 *   description: 评估集与用例的增删改查、批量导入与导出
 */

import { Router } from 'express';
import { requirePermission } from '../../middleware/permission';
import { evalSetController } from './controller';

const router = Router();

/**
 * @swagger
 * /core/eval/sets:
 *   get:
 *     summary: 评估集列表（含用例数与分类分布）
 *     tags: [评估集管理]
 *     responses:
 *       200:
 *         description: 评估集列表
 */
router.get('/sets', (req, res) => evalSetController.listSets(req, res));

/**
 * @swagger
 * /core/eval/sets:
 *   post:
 *     summary: 创建评估集
 *     tags: [评估集管理]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, description: 评估集名称（唯一） }
 *               description: { type: string, description: 描述 }
 *               doc_scope: { type: string, description: 关联文档范围 }
 *               status: { type: string, enum: [normal, disabled, deleted], description: 状态（normal=正常/disabled=禁用/deleted=已删除），默认 normal }
 *     responses:
 *       200:
 *         description: 创建成功
 *       400:
 *         description: 参数错误
 *       409:
 *         description: 评估集名称已存在
 */
router.post('/sets', requirePermission('eval:write'), (req, res) =>
  evalSetController.createSet(req, res),
);

/**
 * @swagger
 * /core/eval/sets/import:
 *   post:
 *     summary: 一步导入（创建评估集 + 导入用例）
 *     tags: [评估集管理]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, cases]
 *             properties:
 *               name: { type: string, description: 评估集名称 }
 *               description: { type: string, description: 描述 }
 *               doc_scope: { type: string, description: 关联文档范围 }
 *               cases:
 *                 type: array
 *                 description: 用例数组（兼容示例数据格式）
 *     responses:
 *       200:
 *         description: 导入成功（含逐条结果）
 *       400:
 *         description: 参数错误
 *       409:
 *         description: 评估集名称已存在
 */
router.post('/sets/import', requirePermission('eval:write'), (req, res) =>
  evalSetController.importSet(req, res),
);

/**
 * @swagger
 * /core/eval/sets/{id}:
 *   get:
 *     summary: 评估集详情（含全部用例）
 *     tags: [评估集管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: 评估集详情
 *       404:
 *         description: 评估集不存在
 *   put:
 *     summary: 更新评估集
 *     tags: [评估集管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: number }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string, nullable: true }
 *               doc_scope: { type: string, nullable: true }
 *               status: { type: string, enum: [normal, disabled], description: 更新接口仅支持 normal/disabled，deleted 请走删除接口 }
 *     responses:
 *       200:
 *         description: 更新成功
 *       404:
 *         description: 评估集不存在
 *   delete:
 *     summary: 删除评估集（软删除，状态改为已删除，级联软删除其下用例）
 *     tags: [评估集管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: 删除成功
 *       404:
 *         description: 评估集不存在
 */
router.get('/sets/:id', (req, res) => evalSetController.getSet(req, res));
router.put('/sets/:id', requirePermission('eval:write'), (req, res) =>
  evalSetController.updateSet(req, res),
);
router.delete('/sets/:id', requirePermission('eval:write'), (req, res) =>
  evalSetController.deleteSet(req, res),
);

/**
 * @swagger
 * /core/eval/sets/{id}/cases:
 *   post:
 *     summary: 批量导入用例（body 为示例数据格式数组）
 *     tags: [评估集管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: number }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               required: [id, question, expected_keywords, category]
 *               properties:
 *                 id: { type: string, description: 用例编号，如 T001 }
 *                 question: { type: string }
 *                 expected_chapter: { type: string, nullable: true, description: null 表示跨章节 }
 *                 expected_keywords: { type: array, items: { type: string } }
 *                 category: { type: string, enum: [事实查询, 概念查询, 理解推理, 综合概括] }
 *                 sort_order: { type: number }
 *     responses:
 *       200:
 *         description: 导入成功（含 inserted/skipped/failures）
 *       400:
 *         description: 参数错误
 *       404:
 *         description: 评估集不存在
 */
router.post('/sets/:id/cases', requirePermission('eval:write'), (req, res) =>
  evalSetController.addCases(req, res),
);

/**
 * @swagger
 * /core/eval/sets/{id}/export:
 *   get:
 *     summary: 导出评估集（示例格式 JSON 数组）
 *     tags: [评估集管理]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: 导出成功
 *       404:
 *         description: 评估集不存在
 */
router.get('/sets/:id/export', (req, res) =>
  evalSetController.exportSet(req, res),
);

/**
 * @swagger
 * /core/eval/cases/{id}:
 *   put:
 *     summary: 更新单条用例
 *     tags: [评估集管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: number }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               case_id: { type: string }
 *               question: { type: string }
 *               expected_chapter: { type: string, nullable: true }
 *               expected_keywords: { type: array, items: { type: string } }
 *               category: { type: string }
 *               sort_order: { type: number }
 *               status: { type: string, enum: [normal, disabled], description: 状态切换（正常/禁用） }
 *     responses:
 *       200:
 *         description: 更新成功
 *       404:
 *         description: 用例不存在
 *   delete:
 *     summary: 删除单条用例（软删除，状态改为已删除）
 *     tags: [评估集管理]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: 删除成功
 *       404:
 *         description: 用例不存在
 */
router.put('/cases/:id', requirePermission('eval:write'), (req, res) =>
  evalSetController.updateCase(req, res),
);
router.delete('/cases/:id', requirePermission('eval:write'), (req, res) =>
  evalSetController.deleteCase(req, res),
);

export default router;
