/**
 * 评估集管理模块 - 控制器
 */

import { Request, Response } from 'express';
import { ErrorCode } from '../../constants';
import { generateTraceId, logUserOperation, logWarn } from '../../utils';
import { error, success } from '../../utils/response';
import { taskService } from '../task/service';
import { EVAL_MESSAGES } from './constants';
import { evalSetService } from './service';
import { EvalCaseInput, EvalSetImportParams } from './types';

/** 解析路径参数 id（Express 5 类型为 string | string[]，兼容两种形态） */
function parseIdParam(raw: string | string[]): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(value, 10);
}

/** 解析请求头 x-user-id（登录用户 id，可空） */
function parseUserId(req: Request): number | null {
  const raw = req.headers['x-user-id'];
  if (Array.isArray(raw)) return raw.length > 0 ? parseInt(raw[0], 10) : null;
  if (!raw) return null;
  const parsed = parseInt(String(raw), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export class EvalSetController {
  /**
   * 评估集列表
   * GET /core/eval/sets
   */
  async listSets(_req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const result = await evalSetService.listSets();
    if (!result.success) {
      logWarn('EVAL_SET_LIST', result.error!.message, { traceId });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    logUserOperation('EVAL_SET_LIST', EVAL_MESSAGES.LIST_SUCCESS, {
      traceId,
      count: result.data!.length,
    });
    success(res, result.data, EVAL_MESSAGES.LIST_SUCCESS);
  }

  /**
   * 创建评估集
   * POST /core/eval/sets
   */
  async createSet(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const { name, description, doc_scope, status } = req.body || {};

    if (typeof name !== 'string' || name.trim() === '') {
      logWarn('EVAL_SET_CREATE', EVAL_MESSAGES.SET_NAME_REQUIRED, { traceId });
      error(res, ErrorCode.BAD_REQUEST, EVAL_MESSAGES.SET_NAME_REQUIRED);
      return;
    }

    const result = await evalSetService.createSet({
      name,
      description,
      doc_scope,
      status,
    });
    if (!result.success) {
      logWarn('EVAL_SET_CREATE', result.error!.message, { traceId, name });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    logUserOperation('EVAL_SET_CREATE', EVAL_MESSAGES.CREATE_SUCCESS, {
      traceId,
      setId: result.data!.id,
      name,
    });
    success(res, result.data, EVAL_MESSAGES.CREATE_SUCCESS);
  }

  /**
   * 评估集详情（含用例）
   * GET /core/eval/sets/:id
   */
  async getSet(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const id = parseIdParam(req.params.id);
    if (isNaN(id)) {
      error(res, ErrorCode.BAD_REQUEST, EVAL_MESSAGES.ID_INVALID);
      return;
    }
    const result = await evalSetService.getSetDetail(id);
    if (!result.success) {
      logWarn('EVAL_SET_GET', result.error!.message, { traceId, setId: id });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    success(res, result.data, EVAL_MESSAGES.GET_SUCCESS);
  }

  /**
   * 更新评估集
   * PUT /core/eval/sets/:id
   */
  async updateSet(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const id = parseIdParam(req.params.id);
    if (isNaN(id)) {
      error(res, ErrorCode.BAD_REQUEST, EVAL_MESSAGES.ID_INVALID);
      return;
    }
    const { name, description, doc_scope, status } = req.body || {};
    const result = await evalSetService.updateSet(id, {
      name,
      description,
      doc_scope,
      status,
    });
    if (!result.success) {
      logWarn('EVAL_SET_UPDATE', result.error!.message, { traceId, setId: id });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    logUserOperation('EVAL_SET_UPDATE', EVAL_MESSAGES.UPDATE_SUCCESS, {
      traceId,
      setId: id,
    });
    success(res, null, EVAL_MESSAGES.UPDATE_SUCCESS);
  }

  /**
   * 删除评估集
   * DELETE /core/eval/sets/:id
   */
  async deleteSet(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const id = parseIdParam(req.params.id);
    if (isNaN(id)) {
      error(res, ErrorCode.BAD_REQUEST, EVAL_MESSAGES.ID_INVALID);
      return;
    }
    const result = await evalSetService.deleteSet(id);
    if (!result.success) {
      logWarn('EVAL_SET_DELETE', result.error!.message, { traceId, setId: id });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    logUserOperation('EVAL_SET_DELETE', EVAL_MESSAGES.DELETE_SUCCESS, {
      traceId,
      setId: id,
    });
    success(res, null, EVAL_MESSAGES.DELETE_SUCCESS);
  }

  /**
   * 批量导入用例
   * POST /core/eval/sets/:id/cases
   */
  async addCases(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const id = parseIdParam(req.params.id);
    if (isNaN(id)) {
      error(res, ErrorCode.BAD_REQUEST, EVAL_MESSAGES.ID_INVALID);
      return;
    }
    const inputs = req.body;
    if (!Array.isArray(inputs) || inputs.length === 0) {
      error(res, ErrorCode.BAD_REQUEST, EVAL_MESSAGES.CASES_REQUIRED);
      return;
    }
    const result = await evalSetService.addCases(id, inputs as EvalCaseInput[]);
    if (!result.success) {
      logWarn('EVAL_CASE_IMPORT', result.error!.message, { traceId, setId: id });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    logUserOperation('EVAL_CASE_IMPORT', EVAL_MESSAGES.IMPORT_SUCCESS, {
      traceId,
      setId: id,
      ...result.data!,
    });
    success(res, result.data, EVAL_MESSAGES.IMPORT_SUCCESS);
  }

  /**
   * 更新单条用例
   * PUT /core/eval/cases/:id
   */
  async updateCase(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const id = parseIdParam(req.params.id);
    if (isNaN(id)) {
      error(res, ErrorCode.BAD_REQUEST, EVAL_MESSAGES.ID_INVALID);
      return;
    }
    const { case_id, question, expected_chapter, expected_keywords, category, sort_order, status } =
      req.body || {};
    const result = await evalSetService.updateCase(id, {
      case_id,
      question,
      expected_chapter,
      expected_keywords,
      category,
      sort_order,
      status,
    });
    if (!result.success) {
      logWarn('EVAL_CASE_UPDATE', result.error!.message, { traceId, caseId: id });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    logUserOperation('EVAL_CASE_UPDATE', EVAL_MESSAGES.UPDATE_SUCCESS, {
      traceId,
      caseId: id,
    });
    success(res, null, EVAL_MESSAGES.UPDATE_SUCCESS);
  }

  /**
   * 删除单条用例
   * DELETE /core/eval/cases/:id
   */
  async deleteCase(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const id = parseIdParam(req.params.id);
    if (isNaN(id)) {
      error(res, ErrorCode.BAD_REQUEST, EVAL_MESSAGES.ID_INVALID);
      return;
    }
    const result = await evalSetService.deleteCase(id);
    if (!result.success) {
      logWarn('EVAL_CASE_DELETE', result.error!.message, { traceId, caseId: id });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    logUserOperation('EVAL_CASE_DELETE', EVAL_MESSAGES.DELETE_SUCCESS, {
      traceId,
      caseId: id,
    });
    success(res, null, EVAL_MESSAGES.DELETE_SUCCESS);
  }

  /**
   * 导出评估集（示例格式 JSON 数组）
   * GET /core/eval/sets/:id/export
   */
  async exportSet(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const id = parseIdParam(req.params.id);
    if (isNaN(id)) {
      error(res, ErrorCode.BAD_REQUEST, EVAL_MESSAGES.ID_INVALID);
      return;
    }
    const result = await evalSetService.exportSet(id);
    if (!result.success) {
      logWarn('EVAL_SET_EXPORT', result.error!.message, { traceId, setId: id });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    logUserOperation('EVAL_SET_EXPORT', EVAL_MESSAGES.EXPORT_SUCCESS, {
      traceId,
      setId: id,
      count: result.data!.length,
    });
    success(res, result.data, EVAL_MESSAGES.EXPORT_SUCCESS);
  }

  /**
   * 一步导入（建集 + 导用例）
   * POST /core/eval/sets/import
   */
  async importSet(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const body = (req.body || {}) as Partial<EvalSetImportParams>;

    if (typeof body.name !== 'string' || body.name.trim() === '') {
      logWarn('EVAL_SET_IMPORT', EVAL_MESSAGES.SET_NAME_REQUIRED, { traceId });
      error(res, ErrorCode.BAD_REQUEST, EVAL_MESSAGES.SET_NAME_REQUIRED);
      return;
    }
    if (!Array.isArray(body.cases) || body.cases.length === 0) {
      error(res, ErrorCode.BAD_REQUEST, EVAL_MESSAGES.CASES_REQUIRED);
      return;
    }

    const result = await evalSetService.importSet(body as EvalSetImportParams);
    if (!result.success) {
      logWarn('EVAL_SET_IMPORT', result.error!.message, {
        traceId,
        name: body.name,
      });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    logUserOperation('EVAL_SET_IMPORT', EVAL_MESSAGES.IMPORT_SUCCESS, {
      traceId,
      setId: result.data!.set.id,
      name: result.data!.set.name,
      import_result: result.data!.import_result,
    });
    success(res, result.data, EVAL_MESSAGES.IMPORT_SUCCESS);
  }

  /**
   * 从已入库文档生成评估集（任务化）
   * POST /core/eval/sets/generate → 提交 eval_set_generate 任务，返回 {task_id}
   * 原同步行为不再保留（P3）；进度/结果通过任务中心 GET /core/tasks/:id 轮询。
   */
  async generateSetFromDocument(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const body = (req.body || {}) as {
      doc_id?: unknown;
      set_name?: unknown;
      count?: unknown;
    };

    if (typeof body.doc_id !== 'string' || body.doc_id.trim() === '') {
      error(res, ErrorCode.BAD_REQUEST, 'doc_id 不能为空');
      return;
    }

    const userId = parseUserId(req);
    const result = await taskService.createTask({
      task_type: 'eval_set_generate',
      payload: {
        doc_id: body.doc_id.trim(),
        set_name:
          typeof body.set_name === 'string' && body.set_name.trim()
            ? body.set_name.trim()
            : undefined,
        count: Number.isFinite(Number(body.count)) ? Number(body.count) : undefined,
      },
      created_by: userId,
    });
    if (!result.success || !result.data) {
      logWarn('EVAL_SET_GENERATE', result.error!.message, {
        traceId,
        docId: body.doc_id,
      });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    logUserOperation('EVAL_SET_GENERATE', '评估集生成任务已提交', {
      traceId,
      taskId: result.data.task_id,
      docId: body.doc_id,
    });
    success(res, result.data, '评估集生成任务已提交');
  }
}

export const evalSetController = new EvalSetController();
