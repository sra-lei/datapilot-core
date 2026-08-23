/**
 * 评估集管理模块 - 常量
 */

/** 用例分类白名单（可扩展） */
export const EVAL_CATEGORIES: readonly string[] = [
  '事实查询',
  '概念查询',
  '理解推理',
  '综合概括',
];

/** 评估集/用例状态：normal=正常（默认，可正常使用），disabled=禁用（跑评估集时跳过），deleted=已删除（软删除） */
export const EVAL_STATUSES: readonly string[] = [ 'normal', 'disabled', 'deleted' ];

/** 可通过更新接口设置的状态（deleted 只能通过删除接口置为软删除） */
export const EVAL_SETTABLE_STATUSES: readonly string[] = [ 'normal', 'disabled' ];

/** 状态展示标签 */
export const EVAL_STATUS_LABELS: Record<string, string> = {
  normal: '正常',
  disabled: '禁用',
  deleted: '已删除',
};

export const EVAL_MESSAGES = {
  // 通用
  ID_INVALID: '无效的 ID',

  // 评估集
  SET_NOT_FOUND: '评估集不存在',
  SET_NAME_REQUIRED: '评估集名称不能为空',
  SET_NAME_EXISTS: '评估集名称已存在',
  STATUS_INVALID:
    '状态无效，可选值：normal（正常）/disabled（禁用）/deleted（已删除）；更新接口仅支持 normal/disabled',

  // 用例
  CASE_NOT_FOUND: '评估用例不存在',
  CASE_ID_INVALID: '用例编号格式非法（仅支持字母、数字、下划线、中划线，1-64 位）',
  CASE_ID_EXISTS: '该评估集内已存在相同编号的用例',
  QUESTION_REQUIRED: '问题（question）不能为空',
  KEYWORDS_REQUIRED: 'expected_keywords 必须是非空字符串数组',
  CHAPTER_INVALID: 'expected_chapter 必须是字符串或 null',
  CATEGORY_INVALID:
    '分类（category）无效，可选值：事实查询/概念查询/理解推理/综合概括',
  CASES_REQUIRED: '用例列表不能为空且必须为数组',

  // 操作结果
  LIST_SUCCESS: '获取评估集列表成功',
  GET_SUCCESS: '获取评估集成功',
  CREATE_SUCCESS: '创建评估集成功',
  UPDATE_SUCCESS: '更新成功',
  DELETE_SUCCESS: '删除成功（软删除）',
  IMPORT_SUCCESS: '导入成功',
  EXPORT_SUCCESS: '导出成功',

  // 失败
  LIST_FAILED: '获取评估集列表失败',
  GET_FAILED: '获取评估集失败',
  CREATE_FAILED: '创建评估集失败',
  UPDATE_FAILED: '更新失败',
  DELETE_FAILED: '删除失败',
  IMPORT_FAILED: '导入失败',
  EXPORT_FAILED: '导出失败',
} as const;
