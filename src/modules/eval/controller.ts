/**
 * 评估报告模块 - 控制器
 */

import { Request, Response } from "express";
import { evalService } from "./service";
import { paginated, success, error } from "../../utils/response";

export class EvalController {
  /**
   * 获取评估集历史趋势与最新详情
   * GET /core/stats/eval
   */
  async getEvalStats(_req: Request, res: Response): Promise<void> {
    const result = await evalService.getEvalStats();

    if (result.success) {
      success(res, result.data, "获取评估报告成功");
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 导入单份评估报告入库
   * POST /core/eval/runs
   */
  async importRun(req: Request, res: Response): Promise<void> {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const result = await evalService.createRun(body);

    if (result.success) {
      success(res, result.data, "评估结果入库成功");
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 批量导入多份评估报告
   * POST /core/eval/runs/batch
   */
  async importRunsBatch(req: Request, res: Response): Promise<void> {
    const list = Array.isArray(req.body) ? req.body : [];
    const result = await evalService.createRunsBatch(list);

    if (result.success) {
      success(res, result.data, "批量导入完成");
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 在线运行评估集（指定评估集，评测后结果入库）
   * POST /core/eval/runs/run
   */
  async runSet(req: Request, res: Response): Promise<void> {
    const set_id = Number((req.body ?? {}).set_id);
    if (!Number.isFinite(set_id) || set_id <= 0) {
      error(res, 400, "set_id 不能为空");
      return;
    }

    const result = await evalService.runSet(set_id);
    if (result.success) {
      success(res, result.data, "评估运行完成");
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 运行历史分页列表
   * GET /core/eval/runs
   */
  async listRuns(req: Request, res: Response): Promise<void> {
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.page_size) || 20;
    const set_id = req.query.set_id ? Number(req.query.set_id) : undefined;

    const result = await evalService.listRuns({
      page,
      page_size: pageSize,
      set_id: Number.isFinite(set_id) ? set_id : undefined,
    });

    if (result.success && result.data) {
      paginated(
        res,
        result.data.list,
        result.data.total,
        result.data.page,
        result.data.page_size,
        "获取运行历史成功",
      );
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 单次运行详情
   * GET /core/eval/runs/:id
   */
  async getRun(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      error(res, 400, "运行 ID 无效");
      return;
    }

    const result = await evalService.getRun(id);
    if (result.success) {
      success(res, result.data, "获取评估运行成功");
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }

  /**
   * 删除一次运行
   * DELETE /core/eval/runs/:id
   */
  async deleteRun(req: Request, res: Response): Promise<void> {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      error(res, 400, "运行 ID 无效");
      return;
    }

    const result = await evalService.deleteRun(id);
    if (result.success) {
      success(res, null, "删除评估运行成功");
    } else {
      error(res, result.error!.code, result.error!.message);
    }
  }
}

// 导出单例
export const evalController = new EvalController();
