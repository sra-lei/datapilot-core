/**
 * 评估报告模块 - 类型定义
 */

import { ServiceResult } from "../../constants";

// 导出全局类型
export { ServiceResult };

/** 历史趋势项 */
export interface EvalHistoryItem {
  timestamp: string;
  avg_score: number;
  avg_elapsed: number;
  total: number;
  passed: number;
  category_stats: Record<string, unknown>;
}

/** 评估统计接口响应 */
export interface EvalStatsData {
  history: EvalHistoryItem[];
  latest: Record<string, unknown> | null;
}
