/**
 * 评估报告模块 - 控制器
 */

import { Request, Response } from "express";
import { evalService } from "./service";
import { success, error } from "../../utils/response";

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
}

// 导出单例
export const evalController = new EvalController();
