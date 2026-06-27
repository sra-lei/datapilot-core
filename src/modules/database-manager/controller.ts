/**
 * 数据库管理模块 - 控制器
 */

import { Request, Response } from 'express';
import { databaseManagerService } from './service';
import { success, error } from '../../utils/response';

export class DatabaseManagerController {
  /**
   * 获取所有表
   * GET /api/database/tables
   */
  async getTables(_req: Request, res: Response): Promise<void> {
    const result = await databaseManagerService.getTables();

    if (result.success) {
      success(res, result.data, '获取表列表成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 获取表结构
   * GET /api/database/tables/:name/info
   */
  async getTableInfo(req: Request, res: Response): Promise<void> {
    const name = String(req.params.name || '');

    if (!name) {
      error(res, 400, '表名不能为空');
      return;
    }

    const result = await databaseManagerService.getTableInfo(name);

    if (result.success) {
      success(res, result.data, '获取表结构成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 获取表数据
   * GET /api/database/tables/:name/data
   */
  async getTableData(req: Request, res: Response): Promise<void> {
    const name = req.params.name as string;
    const limit = parseInt(req.query.limit as string) || 100;

    if (!name) {
      error(res, 400, '表名不能为空');
      return;
    }

    const result = await databaseManagerService.getTableData(name, limit);

    if (result.success) {
      success(res, result.data, '获取表数据成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 执行 SQL 查询
   * POST /api/database/query
   */
  async executeQuery(req: Request, res: Response): Promise<void> {
    const { sql } = req.body;

    if (!sql) {
      error(res, 400, 'SQL 语句不能为空');
      return;
    }

    const result = await databaseManagerService.executeQuery(sql);

    if (result.success) {
      success(res, result.data, '查询成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 获取数据库统计信息
   * GET /api/database/stats
   */
  async getStats(_req: Request, res: Response): Promise<void> {
    const result = await databaseManagerService.getDatabaseStats();

    if (result.success) {
      success(res, result.data, '获取统计信息成功');
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }
}

// 导出单例
export const databaseManagerController = new DatabaseManagerController();
