/**
 * 评估报告模块 - 路由
 * @swagger
 * tags:
 *   name: 评估报告
 *   description: 评估集历史趋势和最新详情
 */

import { Router } from "express";
import { evalController } from "./controller";

const router = Router();

/**
 * @swagger
 * /core/stats/eval:
 *   get:
 *     summary: 获取评估集历史趋势与最新详情
 *     description: 读取 data/reports 下的 test_report_*.json，聚合返回 history + latest，不依赖 RAG 服务
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

export default router;
