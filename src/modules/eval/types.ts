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

/** 评估运行-用例明细（库内行） */
export interface EvalRunCaseRow {
  id: number;
  run_id: number;
  case_id: string;
  question: string;
  score: number | null;
  elapsed: number | null;
  keywords_found: string[];
  keyword_count: number;
  source_count: number;
  has_answer: boolean;
  chapter_match: boolean | null;
  answer_preview: string | null;
  error: string | null;
}

/** 评估运行（库内行） */
export interface EvalRun {
  id: number;
  set_id: number | null;
  set_name: string | null;
  doc_scope: string | null;
  status: string;
  timestamp: string | null;
  total: number;
  passed: number;
  avg_score: number;
  avg_elapsed: number;
  pass_rate: string | null;
  category_stats: Record<string, unknown>;
  failed_cases: unknown[];
  created_at?: string;
  updated_at?: string;
}

/** 评估运行详情（含用例明细与整份原始报告） */
export interface EvalRunDetail extends EvalRun {
  cases: EvalRunCaseRow[];
  raw_report: unknown;
}

/** 运行历史分页列表 */
export interface EvalRunListData {
  list: EvalRun[];
  total: number;
  page: number;
  page_size: number;
}

/** 报告 results 中的单条用例结果（兼容脚本异常形态：仅 id/question/score/error） */
export interface EvalReportResultItem {
  id?: string;
  question?: string;
  score?: number;
  elapsed?: number;
  keywords_found?: string[];
  keyword_count?: number;
  source_count?: number;
  has_answer?: boolean;
  chapter_match?: boolean | null;
  answer_preview?: string;
  error?: string;
}

/** 导入输入（兼容 test_report_*.json 结构 + 可选关联字段） */
export interface EvalReportInput {
  timestamp?: string;
  total?: number;
  passed?: number;
  avg_score?: number;
  avg_elapsed?: number;
  set_id?: number | null;
  set_name?: string | null;
  doc_scope?: string | null;
  summary?: {
    total_cases?: number;
    passed_count?: number;
    pass_rate?: string;
    avg_score?: string;
    avg_elapsed?: string;
    category_stats?: Record<string, unknown>;
    failed_cases?: unknown[];
  };
  results?: EvalReportResultItem[];
}

/** 批量导入逐份结果 */
export interface EvalRunImportItemResult {
  index: number;
  run_id?: number;
  reason?: string;
}

/** 批量导入汇总结果 */
export interface EvalRunImportResult {
  total: number;
  inserted: number;
  failures: EvalRunImportItemResult[];
}

/** 在线运行评估集的结果摘要 */
export interface EvalRunSetResult {
  run_id: number;
  set_id: number;
  set_name: string;
  total: number;
  passed: number;
  avg_score: number;
  avg_elapsed: number;
  failed_count: number;
}
