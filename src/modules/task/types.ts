/**
 * 任务中心模块 - 类型定义
 */

import { ServiceResult } from '../../constants';

// 导出全局类型
export { ServiceResult };

export type TaskType = 'eval_run' | 'eval_set_generate';
export type TaskStatus = 'queued' | 'running' | 'success' | 'failed' | 'cancelled';

/** 任务（执行过程记录；成果落在 eval_sets / eval_runs，result 存关联 id 与摘要） */
export interface Task {
  id: number;
  task_type: TaskType;
  status: TaskStatus;
  payload: Record<string, unknown> | null;
  progress: number;
  progress_detail: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  error: string | null;
  created_by: number | null;
  created_at?: string;
  updated_at?: string;
  finished_at?: string | null;
}

/** 任务列表（分页） */
export interface TaskListData {
  list: Task[];
  total: number;
  page: number;
  page_size: number;
}

/** 创建任务参数 */
export interface CreateTaskParams {
  task_type: TaskType;
  payload: Record<string, unknown>;
  created_by: number | null;
}

/** 任务列表查询过滤 */
export interface TaskListFilters {
  task_type?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

/** 当前请求者可见性上下文（P5：触发人可见全部；admin 可见全部；其余用户不可见） */
export interface TaskActor {
  userId: number | null;
  isAdmin: boolean;
}
