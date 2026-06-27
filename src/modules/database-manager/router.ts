/**
 * 数据库管理模块 - 路由
 * @swagger
 * tags:
 *   name: 数据库管理
 *   description: 数据库表查询、数据查看和统计接口
 */

import { Router } from 'express';
import { databaseManagerController } from './controller';

const router = Router();

/**
 * @swagger
 * /core/database/tables:
 *   get:
 *     summary: 获取所有表
 *     tags: [数据库管理]
 *     responses:
 *       200:
 *         description: 表列表
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
 *                     $ref: '#/components/schemas/TableInfo'
 */
router.get('/tables', (req, res) => databaseManagerController.getTables(req, res));

/**
 * @swagger
 * /core/database/tables/{name}/info:
 *   get:
 *     summary: 获取表结构
 *     tags: [数据库管理]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: 表结构信息
 */
router.get('/tables/:name/info', (req, res) => databaseManagerController.getTableInfo(req, res));

/**
 * @swagger
 * /core/database/tables/{name}/data:
 *   get:
 *     summary: 获取表数据
 *     tags: [数据库管理]
 *     parameters:
 *       - in: path
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: number
 *           default: 100
 *       - in: query
 *         name: offset
 *         schema:
 *           type: number
 *           default: 0
 *     responses:
 *       200:
 *         description: 表数据
 */
router.get('/tables/:name/data', (req, res) => databaseManagerController.getTableData(req, res));

/**
 * @swagger
 * /core/database/query:
 *   post:
 *     summary: 执行SQL查询
 *     tags: [数据库管理]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sql
 *             properties:
 *               sql:
 *                 type: string
 *                 description: SQL语句
 *     responses:
 *       200:
 *         description: 查询结果
 */
router.post('/query', (req, res) => databaseManagerController.executeQuery(req, res));

/**
 * @swagger
 * /core/database/stats:
 *   get:
 *     summary: 获取数据库统计信息
 *     tags: [数据库管理]
 *     responses:
 *       200:
 *         description: 统计信息
 */
router.get('/stats', (req, res) => databaseManagerController.getStats(req, res));

export default router;
