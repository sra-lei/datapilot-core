/**
 * 评估报告模块 - 路由
 * @swagger
 * tags:
 *   name: 评估报告
 *   description: 评估集运行结果入库、历史趋势与运行详情
 */

import { Router } from "express";
import { requirePermission } from "../../middleware/permission";
import { evalController } from "./controller";

const router = Router();

/**
 * @swagger
 * /core/stats/eval:
 *   get:
 *     summary: 获取评估集历史趋势与最新详情
 *     description: 查库（eval_runs）聚合返回 history + latest；库为空时回退读文件。不依赖 RAG 服务
 *     tags: [评估报告]
 *     responses:
 *       200:
 *         description: 评估数据
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: number
 *                 msg:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     history:
 *                       type: array
 *                     latest:
 *                       type: object
 */
router.get("/stats/eval", (req, res) => evalController.getEvalStats(req, res));

/**
 * @swagger
 * /core/eval/runs:
 *   post:
 *     summary: 导入单份评估报告入库（管理台）
 *     description: body 兼容 test_report_*.json 结构，可选 set_id / set_name 关联评估集；单事务原子写入
 *     tags: [评估报告]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               timestamp: { type: string, description: 报告时间戳 YYYYMMDD_HHMMSS }
 *               set_id: { type: number, description: 关联评估集 id（可选） }
 *               set_name: { type: string, description: 评估集名称快照（可选） }
 *               total: { type: number }
 *               passed: { type: number }
 *               avg_score: { type: number }
 *               avg_elapsed: { type: number }
 *               summary: { type: object }
 *               results: { type: array, description: 用例结果数组（必填非空） }
 *     responses:
 *       200:
 *         description: 入库成功（data.run_id）
 *       400:
 *         description: results 为空
 */
router.post("/eval/runs", requirePermission("eval:write"), (req, res) =>
  evalController.importRun(req, res),
);

/**
 * @swagger
 * /core/eval/runs/batch:
 *   post:
 *     summary: 批量导入多份评估报告（管理台，存量回灌）
 *     description: body 为报告对象数组；逐份独立事务，单份失败不影响其余
 *     tags: [评估报告]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *     responses:
 *       200:
 *         description: 批量导入结果（total/inserted/failures）
 *       400:
 *         description: 入参不是非空数组
 */
router.post("/eval/runs/batch", requirePermission("eval:write"), (req, res) =>
  evalController.importRunsBatch(req, res),
);

/**
 * @swagger
 * /core/eval/runs/run:
 *   post:
 *     summary: 在线运行评估集（指定 set_id，评测后结果入库）
 *     description: 取评估集 normal 用例，逐条调 docs-seeker /v1/chat 评测（与 test_chat.py 同口径评分），汇总后写入 eval_runs
 *     tags: [评估报告]
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
 *         description: 运行完成（data 为运行摘要，含 run_id）
 *       400:
 *         description: set_id 无效或评估集无可运行用例
 */
router.post("/eval/runs/run", requirePermission("eval:write"), (req, res) =>
  evalController.runSet(req, res),
);

/**
 * @swagger
 * /core/eval/runs:
 *   get:
 *     summary: 运行历史分页列表
 *     tags: [评估报告]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: number, default: 1 }
 *       - in: query
 *         name: page_size
 *         schema: { type: number, default: 20 }
 *       - in: query
 *         name: set_id
 *         schema: { type: number, description: 按评估集过滤（可选） }
 *     responses:
 *       200:
 *         description: 分页运行列表
 */
router.get("/eval/runs", (req, res) => evalController.listRuns(req, res));

/**
 * @swagger
 * /core/eval/runs/{id}:
 *   get:
 *     summary: 单次运行详情（含用例明细）
 *     tags: [评估报告]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: number }
 *     responses:
 *       200:
 *         description: 运行详情
 *       404:
 *         description: 运行不存在
 *   delete:
 *     summary: 删除一次运行（级联删明细）
 *     tags: [评估报告]
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
 *         description: 运行不存在
 */
router.get("/eval/runs/:id", (req, res) => evalController.getRun(req, res));
router.delete("/eval/runs/:id", requirePermission("eval:write"), (req, res) =>
  evalController.deleteRun(req, res),
);

export default router;
