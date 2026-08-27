/**
 * 任务中心模块 - 控制器
 * 提交（eval-set-generate / eval-run）、列表、详情、取消
 */

import { Request, Response } from 'express';
import { ErrorCode } from '../../constants';
import { generateTraceId, logUserOperation, logWarn } from '../../utils';
import { error, success } from '../../utils/response';
import { TASK_MESSAGES } from './constants';
import { taskService } from './service';

/** 解析请求头 x-user-id（登录用户 id，可空） */
function parseUserId(req: Request): number | null {
  const raw = req.headers['x-user-id'];
  if (Array.isArray(raw)) return raw.length > 0 ? parseInt(raw[0], 10) : null;
  if (!raw) return null;
  const parsed = parseInt(String(raw), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** 解析路径参数 id（Express 5 类型为 string | string[]，兼容两种形态） */
function parseIdParam(raw: string | string[]): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return parseInt(value, 10);
}

export class TaskController {
  /**
   * 提交「从文档生成评估集」任务
   * POST /core/tasks/eval-set-generate {doc_id, set_name?, count?} → {task_id}
   */
  async submitEvalSetGenerate(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const body = (req.body || {}) as {
      doc_id?: unknown;
      set_name?: unknown;
      count?: unknown;
    };

    if (typeof body.doc_id !== 'string' || body.doc_id.trim() === '') {
      error(res, ErrorCode.BAD_REQUEST, TASK_MESSAGES.DOC_ID_REQUIRED);
      return;
    }

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
      created_by: parseUserId(req),
    });
    if (!result.success || !result.data) {
      logWarn('TASK_SUBMIT_GENERATE', result.error!.message, { traceId });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    logUserOperation('TASK_SUBMIT_GENERATE', TASK_MESSAGES.SUBMIT_GENERATE_SUCCESS, {
      traceId,
      taskId: result.data.task_id,
      docId: body.doc_id,
    });
    success(res, result.data, TASK_MESSAGES.SUBMIT_GENERATE_SUCCESS);
  }

  /**
   * 提交「运行评估集」任务
   * POST /core/tasks/eval-run {set_id} → {task_id}
   */
  async submitEvalRun(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const set_id = Number((req.body || {}).set_id);
    if (!Number.isFinite(set_id) || set_id <= 0) {
      error(res, ErrorCode.BAD_REQUEST, TASK_MESSAGES.SET_ID_INVALID);
      return;
    }

    const result = await taskService.createTask({
      task_type: 'eval_run',
      payload: { set_id },
      created_by: parseUserId(req),
    });
    if (!result.success || !result.data) {
      logWarn('TASK_SUBMIT_RUN', result.error!.message, { traceId });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    logUserOperation('TASK_SUBMIT_RUN', TASK_MESSAGES.SUBMIT_RUN_SUCCESS, {
      traceId,
      taskId: result.data.task_id,
      setId: set_id,
    });
    success(res, result.data, TASK_MESSAGES.SUBMIT_RUN_SUCCESS);
  }

  /**
   * 任务列表（type/status 过滤 + 分页）
   * GET /core/tasks?task_type=&status=&page=&page_size=
   */
  async listTasks(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const userId = parseUserId(req);
    const actor = await taskService.resolveActor(userId);
    const result = await taskService.listTasks(
      {
        task_type: typeof req.query.task_type === 'string' ? req.query.task_type : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        page: Number(req.query.page) || undefined,
        page_size: Number(req.query.page_size) || undefined,
      },
      actor,
    );
    if (!result.success || !result.data) {
      logWarn('TASK_LIST', result.error!.message, { traceId });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    success(res, result.data, TASK_MESSAGES.LIST_SUCCESS);
  }

  /**
   * 任务详情
   * GET /core/tasks/:id
   */
  async getTask(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const id = parseIdParam(req.params.id);
    if (isNaN(id)) {
      error(res, ErrorCode.BAD_REQUEST, TASK_MESSAGES.TASK_NOT_FOUND);
      return;
    }
    const userId = parseUserId(req);
    const actor = await taskService.resolveActor(userId);
    const result = await taskService.getTask(id, actor);
    if (!result.success || !result.data) {
      logWarn('TASK_GET', result.error!.message, { traceId, taskId: id });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    success(res, result.data, TASK_MESSAGES.GET_SUCCESS);
  }

  /**
   * 取消任务
   * POST /core/tasks/:id/cancel
   */
  async cancelTask(req: Request, res: Response): Promise<void> {
    const traceId = generateTraceId();
    const id = parseIdParam(req.params.id);
    if (isNaN(id)) {
      error(res, ErrorCode.BAD_REQUEST, TASK_MESSAGES.TASK_NOT_FOUND);
      return;
    }
    const userId = parseUserId(req);
    const actor = await taskService.resolveActor(userId);
    const result = await taskService.cancelTask(id, actor);
    if (!result.success) {
      logWarn('TASK_CANCEL', result.error!.message, { traceId, taskId: id });
      error(res, result.error!.code, result.error!.message);
      return;
    }
    logUserOperation('TASK_CANCEL', TASK_MESSAGES.CANCEL_SUCCESS, {
      traceId,
      taskId: id,
    });
    success(res, null, TASK_MESSAGES.CANCEL_SUCCESS);
  }
}

export const taskController = new TaskController();
