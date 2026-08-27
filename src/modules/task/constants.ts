/**
 * 任务中心模块 - 常量
 */

/** 任务类型 */
export const TASK_TYPES = {
  EVAL_RUN: 'eval_run',
  EVAL_SET_GENERATE: 'eval_set_generate',
} as const;

/** 任务状态：queued=排队中 / running=执行中 / success=成功 / failed=失败 / cancelled=已取消 */
export const TASK_STATUSES = [
  'queued',
  'running',
  'success',
  'failed',
  'cancelled',
] as const;

/** 任务类型展示文案 */
export const TASK_TYPE_LABELS: Record<string, string> = {
  eval_run: '运行评估集',
  eval_set_generate: '生成评估集',
};

/** 任务状态展示文案 */
export const TASK_STATUS_LABELS: Record<string, string> = {
  queued: '排队中',
  running: '执行中',
  success: '成功',
  failed: '失败',
  cancelled: '已取消',
};

export const TASK_MESSAGES = {
  // 提交
  SUBMIT_GENERATE_SUCCESS: '生成任务已提交',
  SUBMIT_RUN_SUCCESS: '评估任务已提交',
  DOC_ID_REQUIRED: 'doc_id 不能为空',
  SET_ID_INVALID: '评估集 id 无效',

  // 列表 / 详情
  LIST_SUCCESS: '获取任务列表成功',
  LIST_FAILED: '获取任务列表失败',
  GET_SUCCESS: '获取任务详情成功',
  GET_FAILED: '获取任务详情失败',
  TASK_NOT_FOUND: '任务不存在或无权查看',

  // 取消
  CANCEL_SUCCESS: '任务已取消',
  CANCEL_FAILED: '取消任务失败',
  CANCEL_NOT_RUNNING: '仅运行中/排队中的任务可取消',
  CANCEL_DENIED: '无权取消该任务',
} as const;
