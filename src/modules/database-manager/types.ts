/**
 * 数据库管理模块 - 类型定义
 */

import { ServiceResult } from "../../constants";

// 导出全局类型
export { ServiceResult };

export interface TableInfo {
  name: string;
  type: string;
}

export interface ColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
}
