/**
 * 评估报告模块 - 常量
 */

export const EVAL_RUN_MESSAGES = {
  // 导入
  IMPORT_SUCCESS: '评估结果入库成功',
  IMPORT_FAILED: '评估结果入库失败',
  BATCH_IMPORT_SUCCESS: '批量导入完成',
  RESULTS_REQUIRED: 'results 不能为空',
  RESULTS_TYPE_INVALID: 'results 必须为非空数组',

  // 在线运行评估集
  RUN_SUCCESS: '评估运行完成',
  RUN_FAILED: '评估运行失败',
  RUNNING: '评估正在运行',
  RUN_SET_ID_REQUIRED: 'set_id 不能为空',
  SET_NOT_FOUND: '评估集不存在',
  NO_RUNNABLE_CASES: '该评估集没有可运行的用例（status=normal）',

  // 运行历史
  LIST_SUCCESS: '获取运行历史成功',
  LIST_FAILED: '获取运行历史失败',
  GET_SUCCESS: '获取评估运行成功',
  RUN_NOT_FOUND: '评估运行不存在',
  DELETE_SUCCESS: '删除评估运行成功',
  DELETE_FAILED: '删除评估运行失败',
} as const;
