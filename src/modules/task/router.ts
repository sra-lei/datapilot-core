/**
 * 任务中心模块 - 路由
 * @swagger
 * tags:
 *   name: 任务中心
 *   description: 长耗时操作（生成评估集 / 运行评估集）异步任务化：提交、列表、详情、取消
 */

import { Router } from 'express';
import { requirePermission } from '../../middleware/permission';
import { taskController } from './controller';

const router = Router();

/**
 * @swagger
 * /core/tasks/eval-set-generate:
 *   post:
 *     summary: 提交「从文档生成评估集」任务
 *     description: 返回 task_id，异步执行；进度/结果通过 GET /core/tasks/:id 轮询
 *     tags: [任务中心]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [doc_id]
 *             properties:
 *               doc_id: { type: string, description: 已入库文档 task_id }
 *               set_name: { type: string, description: 评估集名称（可选） }
 *               count: { type: number, description: 生成条数（可选） }
 *     responses:
 *       200:
 *         description: 提交成功（data.task_id）
 *       400:
 *         description: doc_id 为空
 */
router.post('/eval-set-generate', requirePermission('eval:write'), (req, res) =>
  taskController.submitEvalSetGenerate(req, res),
);

/**
 * @swagger
 * /core/tasks/eval-run:
 *   post:
 *     summary: 提交「运行评估集」任务
 *     description: 返回 task_id，异步执行；进度/结果通过 GET /core/tasks/:id 轮询
 *     tags: [任务中心]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [set_id]
 *             properties:
 *               set_id: { type: number, description: 评估集 id }
 *     responses:
 *       200:
 *         description: 提交成功（data.task_id）
 *       400:
 *         description: set_id 无效
 */
router.post('/eval-run', requirePermission('eval:write'), (req, res) =>
  taskController.submitEvalRun(req, res),
);

/**
 * @swagger
 * /core/tasks:
 *   get:
 *     summary: 任务列表（type/status 过滤 + 分页）
 *     description: 可见性：触发人可见全部；admin 可见全部；其余用户不可见
 *     tags: [任务中心]
 *     parameters:
 *       - in: query
 *         name: task_type
 *         schema: { type: string, enum: [eval_run, eval_set_generate] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [queued, running, success, failed, cancelled] }
 *       - in: query
 *         name: page
 *         schema: { type: number, default: 1 }
 *       - in: query
 *         name: page_size
 *         schema: { type: number, default: 20 }
 *     responses:
 *       200:
 *         description: 分页任务列表
 */
router.get('/', (req, res) => taskController.listTasks(req, res));

/**
 * @swagger
 * /core/tasks/{id}:
 *   get:
 *     summary: 任务详情（status/progress/progress_detail/result/error）
 *     tags: [任务中心]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: 任务详情
 *       404:
 *         description: 任务不存在或无权查看
 */
router.get('/:id', (req, res) => taskController.getTask(req, res));

/**
 * @swagger
 * /core/tasks/{id}/cancel:
 *   post:
 *     summary: 取消运行中/排队中的任务
 *     tags: [任务中心]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: 取消成功
 *       409:
 *         description: 任务已结束，不可取消
 */
router.post('/:id/cancel', requirePermission('eval:write'), (req, res) =>
  taskController.cancelTask(req, res),
);

export default router;
