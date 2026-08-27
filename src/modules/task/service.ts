/**
 * 任务中心模块 - 服务层
 * 任务表（tasks）CRUD + 状态推进（queued → running → success/failed/cancelled）+ 可见性（P5）。
 * 执行由 TaskWorker（进程内串行队列）完成；本服务只负责持久化与状态机。
 */

import { ErrorCode } from '../../constants';
import { DatabaseFactory, QueryRow } from '../../database';
import { logger } from '../../utils';
import { permissionService } from '../permission';
import { TASK_MESSAGES } from './constants';
import {
  CreateTaskParams,
  ServiceResult,
  Task,
  TaskActor,
  TaskListData,
  TaskListFilters,
} from './types';
import { taskWorker } from './worker';

function getDb() {
  return DatabaseFactory.getInstance();
}

/** 解析库内 JSON 字段（兼容字符串与已解析对象两种形态） */
function parseJsonField<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

/** tasks 行 → Task */
function mapTaskRow(row: QueryRow): Task {
  return {
    id: Number(row.id),
    task_type: String(row.task_type) as Task['task_type'],
    status: String(row.status ?? 'queued') as Task['status'],
    payload: parseJsonField<Record<string, unknown> | null>(row.payload, null),
    progress: Number(row.progress || 0),
    progress_detail: parseJsonField<Record<string, unknown> | null>(
      row.progress_detail,
      null,
    ),
    result: parseJsonField<Record<string, unknown> | null>(row.result, null),
    error: row.error ? String(row.error) : null,
    created_by:
      row.created_by === null || row.created_by === undefined
        ? null
        : Number(row.created_by),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    finished_at: row.finished_at ? String(row.finished_at) : null,
  };
}

export class TaskService {
  /**
   * 解析请求者可见性上下文（P5：触发人可见全部；admin 可见全部；其余用户不可见）
   */
  async resolveActor(userId: number | null): Promise<TaskActor> {
    if (userId === null || userId === undefined) {
      return { userId: null, isAdmin: false };
    }
    try {
      const result = await permissionService.getUserPermissions(userId);
      const roles = result.data?.roles ?? [];
      const isAdmin = roles.some((r) => r.name === 'admin');
      return { userId, isAdmin };
    } catch (error) {
      logger.error('解析任务可见性失败', { error, userId });
      return { userId, isAdmin: false };
    }
  }

  /**
   * 提交任务：入表（queued）→ 交给 worker 排队执行，立即返回 task_id
   */
  async createTask(
    params: CreateTaskParams,
  ): Promise<ServiceResult<{ task_id: number }>> {
    try {
      const db = getDb();
      const result = await db.insert(
        `INSERT INTO tasks (task_type, status, payload, created_by)
         VALUES (?, 'queued', ?, ?)`,
        [ params.task_type, JSON.stringify(params.payload ?? {}), params.created_by ],
      );
      const taskId = result.insertId;
      if (!taskId) {
        return {
          success: false,
          error: { code: ErrorCode.INTERNAL_ERROR, message: '任务创建失败' },
        };
      }
      taskWorker.enqueue(taskId);
      return { success: true, data: { task_id: taskId } };
    } catch (error) {
      logger.error('创建任务失败', { error, taskType: params.task_type });
      return {
        success: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message: '任务创建失败' },
      };
    }
  }

  /**
   * 任务列表（type/status 过滤 + 分页；按可见性过滤）
   */
  async listTasks(
    filters: TaskListFilters,
    actor: TaskActor,
  ): Promise<ServiceResult<TaskListData>> {
    try {
      // 未登录且非 admin：不可见任何任务
      if (!actor.isAdmin && actor.userId === null) {
        return {
          success: true,
          data: { list: [], total: 0, page: 1, page_size: filters.page_size ?? 20 },
        };
      }

      const db = getDb();
      const page = Math.max(1, filters.page || 1);
      const pageSize = Math.min(100, Math.max(1, filters.page_size || 20));
      const offset = (page - 1) * pageSize;

      const where: string[] = [];
      const params: unknown[] = [];
      if (filters.task_type) {
        where.push('task_type = ?');
        params.push(filters.task_type);
      }
      if (filters.status) {
        where.push('status = ?');
        params.push(filters.status);
      }
      if (!actor.isAdmin && actor.userId !== null) {
        where.push('created_by = ?');
        params.push(actor.userId);
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

      const countResult = await db.query(
        `SELECT COUNT(*) AS count FROM tasks ${whereSql}`,
        params,
      );
      const total = Number((countResult.rows?.[0] as QueryRow)?.count || 0);

      const listResult = await db.query(
        `SELECT * FROM tasks ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [ ...params, pageSize, offset ],
      );
      const list = (listResult.rows || []).map((r) => mapTaskRow(r as QueryRow));

      return {
        success: true,
        data: { list, total, page, page_size: pageSize },
      };
    } catch (error) {
      logger.error('获取任务列表失败', { error, filters });
      return {
        success: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message: TASK_MESSAGES.LIST_FAILED },
      };
    }
  }

  /**
   * 任务详情（可见性校验）
   */
  async getTask(id: number, actor: TaskActor): Promise<ServiceResult<Task>> {
    try {
      const db = getDb();
      const result = await db.query('SELECT * FROM tasks WHERE id = ?', [ id ]);
      const row = result.rows?.[0] as QueryRow | undefined;
      if (!row) {
        return {
          success: false,
          error: { code: ErrorCode.NOT_FOUND, message: TASK_MESSAGES.TASK_NOT_FOUND },
        };
      }
      const task = mapTaskRow(row);
      if (!actor.isAdmin && task.created_by !== actor.userId) {
        return {
          success: false,
          error: { code: ErrorCode.NOT_FOUND, message: TASK_MESSAGES.TASK_NOT_FOUND },
        };
      }
      return { success: true, data: task };
    } catch (error) {
      logger.error('获取任务详情失败', { error, taskId: id });
      return {
        success: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message: TASK_MESSAGES.GET_FAILED },
      };
    }
  }

  /**
   * 取消任务（仅 queued/running 可取消；worker 在用例边界检查标志位）
   */
  async cancelTask(id: number, actor: TaskActor): Promise<ServiceResult> {
    try {
      const db = getDb();
      const result = await db.query(
        'SELECT id, status, created_by FROM tasks WHERE id = ?',
        [ id ],
      );
      const row = result.rows?.[0] as QueryRow | undefined;
      if (!row) {
        return {
          success: false,
          error: { code: ErrorCode.NOT_FOUND, message: TASK_MESSAGES.TASK_NOT_FOUND },
        };
      }
      if (!actor.isAdmin && Number(row.created_by) !== actor.userId) {
        return {
          success: false,
          error: { code: ErrorCode.FORBIDDEN, message: TASK_MESSAGES.CANCEL_DENIED },
        };
      }
      const status = String(row.status ?? 'queued');
      if (status !== 'queued' && status !== 'running') {
        return {
          success: false,
          error: { code: ErrorCode.CONFLICT, message: TASK_MESSAGES.CANCEL_NOT_RUNNING },
        };
      }
      await db.update(
        `UPDATE tasks SET status = 'cancelled', finished_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status IN ('queued', 'running')`,
        [ id ],
      );
      return { success: true };
    } catch (error) {
      logger.error('取消任务失败', { error, taskId: id });
      return {
        success: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message: TASK_MESSAGES.CANCEL_FAILED },
      };
    }
  }

  // ------------------------------------------------------------------ //
  //  worker 内部状态推进（不对外路由）
  // ------------------------------------------------------------------ //

  /** 取任务给 worker 执行（含最新状态，排队中被取消的任务在此被跳过） */
  async getTaskForWorker(id: number): Promise<Task | null> {
    try {
      const db = getDb();
      const result = await db.query('SELECT * FROM tasks WHERE id = ?', [ id ]);
      const row = result.rows?.[0] as QueryRow | undefined;
      return row ? mapTaskRow(row) : null;
    } catch (error) {
      logger.error('worker 读取任务失败', { error, taskId: id });
      return null;
    }
  }

  async markRunning(id: number): Promise<void> {
    await getDb().update(
      'UPDATE tasks SET status = \'running\' WHERE id = ? AND status = \'queued\'',
      [ id ],
    );
  }

  /** 进度推进（仅运行中/排队中生效，避免与终态竞争覆盖） */
  async updateProgress(
    id: number,
    progress: number,
    detail: Record<string, unknown>,
  ): Promise<void> {
    await getDb().update(
      `UPDATE tasks SET progress = ?, progress_detail = ?
       WHERE id = ? AND status IN ('queued', 'running')`,
      [ Math.max(0, Math.min(100, Math.round(progress))), JSON.stringify(detail), id ],
    );
  }

  async complete(id: number, result: Record<string, unknown>): Promise<void> {
    await getDb().update(
      `UPDATE tasks SET status = 'success', progress = 100, result = ?,
         error = NULL, finished_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [ JSON.stringify(result), id ],
    );
  }

  async fail(id: number, message: string): Promise<void> {
    await getDb().update(
      `UPDATE tasks SET status = 'failed', error = ?,
         finished_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [ message, id ],
    );
  }

  async markCancelled(id: number): Promise<void> {
    await getDb().update(
      `UPDATE tasks SET status = 'cancelled', finished_at = CURRENT_TIMESTAMP
       WHERE id = ? AND status IN ('queued', 'running')`,
      [ id ],
    );
  }

  /** 取消标志位：worker 在每个用例边界检查 */
  async shouldCancel(id: number): Promise<boolean> {
    try {
      const db = getDb();
      const result = await db.query(
        'SELECT status FROM tasks WHERE id = ?',
        [ id ],
      );
      const status = String((result.rows?.[0] as QueryRow)?.status ?? '');
      return status === 'cancelled';
    } catch (error) {
      logger.error('检查任务取消标志失败', { error, taskId: id });
      return false;
    }
  }

  /** 启动恢复：进程重启把 queued/running 置为 failed（成果未落库，需重试） */
  async startupRecovery(): Promise<number> {
    const result = await getDb().update(
      `UPDATE tasks SET status = 'failed', error = '进程重启中断，请重试',
         finished_at = CURRENT_TIMESTAMP
       WHERE status IN ('queued', 'running')`,
    );
    return result.affectedRows || 0;
  }

  /** 保留策略（P6）：成功保留 7 天、失败/取消保留 30 天 */
  async cleanup(): Promise<number> {
    const result = await getDb().delete(
      `DELETE FROM tasks
       WHERE (status = 'success' AND created_at < NOW() - INTERVAL 7 DAY)
          OR (status IN ('failed', 'cancelled') AND created_at < NOW() - INTERVAL 30 DAY)`,
    );
    return result.affectedRows || 0;
  }
}

export const taskService = new TaskService();
