/**
 * 评估报告模块 - 服务层
 * 读取评估报告文件（data/reports/test_report_*.json），聚合返回 history + latest
 */

import fs from "fs";
import path from "path";
import { EvalHistoryItem, EvalStatsData, ServiceResult } from "./types";

export class EvalService {
  /** 报告目录（生产环境由 compose 挂载到 /app/data/reports） */
  private readonly reportDir = path.resolve(process.cwd(), "data/reports");

  /**
   * 获取评估集历史趋势与最新详情
   * 遍历 data/reports 下所有 test_report_*.json，聚合生成 history + latest
   */
  async getEvalStats(): Promise<ServiceResult<EvalStatsData>> {
    try {
      if (!fs.existsSync(this.reportDir)) {
        return {
          success: true,
          data: { history: [], latest: null },
        };
      }

      const files = fs
        .readdirSync(this.reportDir)
        .filter((f) => f.startsWith("test_report_") && f.endsWith(".json"))
        .sort();

      const history: EvalHistoryItem[] = [];
      let latest: Record<string, unknown> | null = null;

      for (const file of files) {
        try {
          const filePath = path.join(this.reportDir, file);
          const raw = fs.readFileSync(filePath, "utf-8");
          const report = JSON.parse(raw);

          history.push({
            timestamp: String(report.timestamp ?? ""),
            avg_score: Number(report.avg_score ?? 0),
            avg_elapsed: Number(report.avg_elapsed ?? 0),
            total: Number(report.total ?? 0),
            passed: Number(report.passed ?? 0),
            category_stats:
              report.summary?.category_stats ?? {},
          });
        } catch {
          // 单个报告解析失败则跳过，不影响整体
          continue;
        }
      }

      // 最新报告（文件名排序后最后一个）
      if (files.length > 0) {
        try {
          const lastFile = path.join(this.reportDir, files[files.length - 1]);
          latest = JSON.parse(fs.readFileSync(lastFile, "utf-8"));
        } catch {
          latest = null;
        }
      }

      return {
        success: true,
        data: { history, latest },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 500,
          message: `获取评估报告失败: ${(error as Error).message}`,
        },
      };
    }
  }
}

export const evalService = new EvalService();
