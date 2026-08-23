/**
 * 评估集管理模块 - 类型定义
 */

import { ServiceResult } from '../../constants';

// 导出全局类型
export { ServiceResult };

/** 评估集/用例状态：normal=正常（默认），disabled=禁用（跑评估集时跳过），deleted=已删除（软删除） */
export type EvalStatus = 'normal' | 'disabled' | 'deleted';

/** 评估集 */
export interface EvalSet {
  id: number;
  name: string;
  description: string | null;
  doc_scope: string | null;
  status: EvalStatus;
  created_at?: string;
  updated_at?: string;
}

/** 评估用例（库内存储形态） */
export interface EvalCase {
  id: number;
  set_id: number;
  case_id: string;
  question: string;
  expected_chapter: string | null;
  expected_keywords: string[];
  category: string;
  sort_order: number;
  status: EvalStatus;
  created_at?: string;
  updated_at?: string;
}

/** 评估用例输入（兼容示例数据格式） */
export interface EvalCaseInput {
  id: string;
  question: string;
  expected_chapter?: string | null;
  expected_keywords: string[];
  category: string;
  sort_order?: number;
}

/** 评估集列表项（含统计） */
export interface EvalSetListItem extends EvalSet {
  case_count: number;
  category_stats: Record<string, number>;
}

/** 评估集详情（含全部用例） */
export interface EvalSetDetail {
  set: EvalSet;
  cases: EvalCase[];
}

/** 批量导入失败明细 */
export interface EvalCaseImportFailure {
  index: number;
  id?: string;
  reason: string;
}

/** 批量导入结果 */
export interface EvalCaseImportResult {
  total: number;
  inserted: number;
  /** 编号重复且仍生效 → 跳过 */
  skipped: number;
  /** 编号重复但已软删除 → 恢复为生效中并更新内容 */
  restored: number;
  failures: EvalCaseImportFailure[];
}

/** 一步导入（建集 + 导用例）请求参数 */
export interface EvalSetImportParams {
  name: string;
  description?: string;
  doc_scope?: string;
  status?: string;
  cases: EvalCaseInput[];
}

/** 一步导入结果 */
export interface EvalSetImportData {
  set: EvalSet;
  import_result: EvalCaseImportResult;
}
