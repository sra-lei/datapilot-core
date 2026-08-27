/**
 * 评估集管理模块 - 服务层
 * 评估集与用例的 CRUD、批量导入、导出（数据存于 MySQL：eval_sets / eval_cases）
 */

import { ErrorCode } from '../../constants';
import { DatabaseFactory, QueryRow } from '../../database';
import { envConfig, logger } from '../../utils';
import {
  EVAL_CATEGORIES,
  EVAL_MESSAGES,
  EVAL_SETTABLE_STATUSES,
} from './constants';
import {
  EvalCase,
  EvalCaseImportResult,
  EvalCaseInput,
  EvalSet,
  EvalSetDetail,
  EvalSetImportData,
  EvalSetImportParams,
  EvalSetListItem,
  EvalStatus,
  ServiceResult,
} from './types';

function getDb() {
  return DatabaseFactory.getInstance();
}

/** 用例编号格式：字母/数字/下划线/中划线，1-64 位 */
const CASE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** 解析库内 JSON 关键词字段（兼容字符串与已解析数组两种形态） */
function parseKeywords(raw: unknown): string[] {
  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(parsed)
    ? parsed.filter((k): k is string => typeof k === 'string')
    : [];
}

/** 行 → EvalCase */
function mapCaseRow(row: QueryRow): EvalCase {
  return {
    id: Number(row.id),
    set_id: Number(row.set_id),
    case_id: String(row.case_id),
    question: String(row.question),
    expected_chapter: row.expected_chapter ? String(row.expected_chapter) : null,
    expected_keywords: parseKeywords(row.expected_keywords),
    category: String(row.category),
    sort_order: Number(row.sort_order || 0),
    status: (String(row.status ?? 'normal') as EvalStatus),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

/** 单条用例输入校验，返回错误原因；合法返回 null */
function validateCaseInput(input: EvalCaseInput): string | null {
  if (!input || typeof input !== 'object') {
    return '用例格式错误';
  }
  if (typeof input.id !== 'string' || !CASE_ID_PATTERN.test(input.id)) {
    return EVAL_MESSAGES.CASE_ID_INVALID;
  }
  if (typeof input.question !== 'string' || input.question.trim() === '') {
    return EVAL_MESSAGES.QUESTION_REQUIRED;
  }
  if (
    !Array.isArray(input.expected_keywords) ||
    input.expected_keywords.length === 0 ||
    !input.expected_keywords.every(
      (k) => typeof k === 'string' && k.trim() !== '',
    )
  ) {
    return EVAL_MESSAGES.KEYWORDS_REQUIRED;
  }
  if (
    input.expected_chapter !== undefined &&
    input.expected_chapter !== null &&
    typeof input.expected_chapter !== 'string'
  ) {
    return EVAL_MESSAGES.CHAPTER_INVALID;
  }
  if (
    typeof input.category !== 'string' ||
    !EVAL_CATEGORIES.includes(input.category)
  ) {
    return EVAL_MESSAGES.CATEGORY_INVALID;
  }
  return null;
}

export class EvalSetService {
  /**
   * 评估集列表（含用例数与分类分布）
   */
  async listSets(): Promise<ServiceResult<EvalSetListItem[]>> {
    try {
      const db = getDb();

      const setsResult = await db.query(
        `SELECT s.*, COUNT(c.id) AS case_count
         FROM eval_sets s
         LEFT JOIN eval_cases c ON c.set_id = s.id AND c.status <> 'deleted'
         WHERE s.status <> 'deleted'
         GROUP BY s.id, s.name, s.description, s.doc_scope, s.status, s.created_at, s.updated_at
         ORDER BY s.id DESC`,
      );

      const catResult = await db.query(
        `SELECT set_id, category, COUNT(*) AS count
         FROM eval_cases
         WHERE status <> 'deleted'
         GROUP BY set_id, category`,
      );
      const catMap: Record<number, Record<string, number>> = {};
      for (const row of catResult.rows || []) {
        const set_id = Number((row as QueryRow).set_id);
        const category = String((row as QueryRow).category);
        const count = Number((row as QueryRow).count);
        if (!catMap[set_id]) catMap[set_id] = {};
        catMap[set_id][category] = count;
      }

      const list: EvalSetListItem[] = (setsResult.rows || []).map((row) => {
        const r = row as QueryRow;
        const id = Number(r.id);
        return {
          id,
          name: String(r.name),
          description: r.description ? String(r.description) : null,
          doc_scope: r.doc_scope ? String(r.doc_scope) : null,
          status: (String(r.status ?? 'normal') as EvalStatus),
          created_at: r.created_at ? String(r.created_at) : undefined,
          updated_at: r.updated_at ? String(r.updated_at) : undefined,
          case_count: Number(r.case_count || 0),
          category_stats: catMap[id] || {},
        };
      });

      return { success: true, data: list };
    } catch (error) {
      logger.error('获取评估集列表失败', { error });
      return {
        success: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message: EVAL_MESSAGES.LIST_FAILED },
      };
    }
  }

  /**
   * 创建评估集
   */
  async createSet(params: {
    name: string;
    description?: string | null;
    doc_scope?: string | null;
    status?: string;
  }): Promise<ServiceResult<EvalSet>> {
    try {
      const db = getDb();
      const name = params.name.trim();
      const status =
        params.status && EVAL_SETTABLE_STATUSES.includes(params.status)
          ? (params.status as EvalStatus)
          : 'normal';

      const result = await db.insert(
        'INSERT INTO eval_sets (name, description, doc_scope, status) VALUES (?, ?, ?, ?)',
        [ name, params.description ?? null, params.doc_scope ?? null, status ],
      );

      return {
        success: true,
        data: {
          id: result.insertId!,
          name,
          description: params.description ?? null,
          doc_scope: params.doc_scope ?? null,
          status,
        },
      };
    } catch (error) {
      if (String((error as { message?: string }).message).includes('ER_DUP_ENTRY')) {
        return {
          success: false,
          error: { code: ErrorCode.CONFLICT, message: EVAL_MESSAGES.SET_NAME_EXISTS },
        };
      }
      logger.error('创建评估集失败', { error });
      return {
        success: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message: EVAL_MESSAGES.CREATE_FAILED },
      };
    }
  }

  /**
   * 评估集详情（含全部用例，按排序与编号排列）
   */
  async getSetDetail(id: number): Promise<ServiceResult<EvalSetDetail>> {
    try {
      const db = getDb();

      const setResult = await db.query(
        'SELECT * FROM eval_sets WHERE id = ? AND status <> \'deleted\'',
        [ id ],
      );
      if (!setResult.rows || setResult.rows.length === 0) {
        return {
          success: false,
          error: { code: ErrorCode.NOT_FOUND, message: EVAL_MESSAGES.SET_NOT_FOUND },
        };
      }

      const row = setResult.rows[0] as QueryRow;
      const set: EvalSet = {
        id,
        name: String(row.name),
        description: row.description ? String(row.description) : null,
        doc_scope: row.doc_scope ? String(row.doc_scope) : null,
        status: (String(row.status ?? 'normal') as EvalStatus),
        created_at: row.created_at ? String(row.created_at) : undefined,
        updated_at: row.updated_at ? String(row.updated_at) : undefined,
      };

      const casesResult = await db.query(
        'SELECT * FROM eval_cases WHERE set_id = ? AND status <> \'deleted\' ORDER BY sort_order, case_id',
        [ id ],
      );
      const cases: EvalCase[] = (casesResult.rows || []).map((r) =>
        mapCaseRow(r as QueryRow),
      );

      return { success: true, data: { set, cases } };
    } catch (error) {
      logger.error('获取评估集详情失败', { error, setId: id });
      return {
        success: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message: EVAL_MESSAGES.GET_FAILED },
      };
    }
  }

  /**
   * 更新评估集元信息
   */
  async updateSet(
    id: number,
    params: {
      name?: string;
      description?: string | null;
      doc_scope?: string | null;
      status?: string;
    },
  ): Promise<ServiceResult> {
    try {
      const db = getDb();

      const exist = await db.query('SELECT id FROM eval_sets WHERE id = ?', [ id ]);
      if (!exist.rows || exist.rows.length === 0) {
        return {
          success: false,
          error: { code: ErrorCode.NOT_FOUND, message: EVAL_MESSAGES.SET_NOT_FOUND },
        };
      }

      const sets: string[] = [];
      const values: unknown[] = [];
      if (params.name !== undefined) {
        sets.push('name = ?');
        values.push(params.name.trim());
      }
      if (params.description !== undefined) {
        sets.push('description = ?');
        values.push(params.description ?? null);
      }
      if (params.doc_scope !== undefined) {
        sets.push('doc_scope = ?');
        values.push(params.doc_scope ?? null);
      }
      if (params.status !== undefined) {
        if (!EVAL_SETTABLE_STATUSES.includes(params.status)) {
          return {
            success: false,
            error: { code: ErrorCode.BAD_REQUEST, message: EVAL_MESSAGES.STATUS_INVALID },
          };
        }
        sets.push('status = ?');
        values.push(params.status);
      }
      if (sets.length === 0) return { success: true };

      values.push(id);
      await db.update(`UPDATE eval_sets SET ${sets.join(', ')} WHERE id = ?`, values);
      return { success: true };
    } catch (error) {
      if (String((error as { message?: string }).message).includes('ER_DUP_ENTRY')) {
        return {
          success: false,
          error: { code: ErrorCode.CONFLICT, message: EVAL_MESSAGES.SET_NAME_EXISTS },
        };
      }
      logger.error('更新评估集失败', { error, setId: id });
      return {
        success: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message: EVAL_MESSAGES.UPDATE_FAILED },
      };
    }
  }

  /**
   * 删除评估集（软删除：状态改为 deleted，并级联软删除其下用例）
   */
  async deleteSet(id: number): Promise<ServiceResult> {
    try {
      const db = getDb();
      const result = await db.update(
        'UPDATE eval_sets SET status = \'deleted\' WHERE id = ? AND status <> \'deleted\'',
        [ id ],
      );
      if (result.affectedRows === 0) {
        return {
          success: false,
          error: { code: ErrorCode.NOT_FOUND, message: EVAL_MESSAGES.SET_NOT_FOUND },
        };
      }
      // 级联软删除其下用例
      await db.update(
        'UPDATE eval_cases SET status = \'deleted\' WHERE set_id = ? AND status <> \'deleted\'',
        [ id ],
      );
      return { success: true };
    } catch (error) {
      logger.error('删除评估集失败', { error, setId: id });
      return {
        success: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message: EVAL_MESSAGES.DELETE_FAILED },
      };
    }
  }

  /**
   * 批量导入用例（兼容示例数据数组格式）
   * 逐条校验：非法条目计入 failures；
   * 编号已存在且生效 → skipped；编号已存在但已软删除 → 恢复为生效中并更新内容（restored）；其余插入
   */
  async addCases(
    setId: number,
    inputs: EvalCaseInput[],
  ): Promise<ServiceResult<EvalCaseImportResult>> {
    try {
      const db = getDb();

      const setResult = await db.query(
        'SELECT id FROM eval_sets WHERE id = ? AND status <> \'deleted\'',
        [ setId ],
      );
      if (!setResult.rows || setResult.rows.length === 0) {
        return {
          success: false,
          error: { code: ErrorCode.NOT_FOUND, message: EVAL_MESSAGES.SET_NOT_FOUND },
        };
      }

      // 未删除编号（正常/禁用）→ 跳过；已删除编号 → 恢复为正常（记录库内行 id）
      const existingResult = await db.query(
        'SELECT id, case_id, status FROM eval_cases WHERE set_id = ?',
        [ setId ],
      );
      const existingIds = new Set<string>();
      const deletedRows = new Map<string, number>();
      for (const r of existingResult.rows || []) {
        const row = r as QueryRow;
        const case_id = String(row.case_id);
        if (String(row.status ?? 'normal') === 'deleted') {
          deletedRows.set(case_id, Number(row.id));
        } else {
          existingIds.add(case_id);
        }
      }

      const result: EvalCaseImportResult = {
        total: inputs.length,
        inserted: 0,
        skipped: 0,
        restored: 0,
        failures: [],
      };

      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        const reason = validateCaseInput(input);
        if (reason) {
          result.failures.push({ index: i, id: input?.id, reason });
          continue;
        }
        const deletedDbId = deletedRows.get(input.id);
        if (deletedDbId !== undefined) {
          // 恢复已删除的同编号用例为正常并更新内容
          await db.update(
            `UPDATE eval_cases
             SET status = 'normal', question = ?, expected_chapter = ?,
                 expected_keywords = ?, category = ?, sort_order = ?
             WHERE id = ?`,
            [
              input.question.trim(),
              input.expected_chapter ?? null,
              JSON.stringify(input.expected_keywords),
              input.category,
              input.sort_order ?? 0,
              deletedDbId,
            ],
          );
          deletedRows.delete(input.id);
          existingIds.add(input.id);
          result.restored += 1;
          continue;
        }
        if (existingIds.has(input.id)) {
          result.skipped += 1;
          continue;
        }
        await db.insert(
          `INSERT INTO eval_cases
             (set_id, case_id, question, expected_chapter, expected_keywords, category, sort_order, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'normal')`,
          [
            setId,
            input.id,
            input.question.trim(),
            input.expected_chapter ?? null,
            JSON.stringify(input.expected_keywords),
            input.category,
            input.sort_order ?? 0,
          ],
        );
        existingIds.add(input.id);
        result.inserted += 1;
      }

      return { success: true, data: result };
    } catch (error) {
      logger.error('导入评估用例失败', { error, setId });
      return {
        success: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message: EVAL_MESSAGES.IMPORT_FAILED },
      };
    }
  }

  /**
   * 更新单条用例
   */
  async updateCase(
    id: number,
    params: {
      case_id?: string;
      question?: string;
      expected_chapter?: string | null;
      expected_keywords?: string[];
      category?: string;
      sort_order?: number;
      status?: string;
    },
  ): Promise<ServiceResult> {
    try {
      const db = getDb();

      const exist = await db.query(
        'SELECT id, set_id FROM eval_cases WHERE id = ? AND status <> \'deleted\'',
        [ id ],
      );
      if (!exist.rows || exist.rows.length === 0) {
        return {
          success: false,
          error: { code: ErrorCode.NOT_FOUND, message: EVAL_MESSAGES.CASE_NOT_FOUND },
        };
      }
      const set_id = Number((exist.rows[0] as QueryRow).set_id);

      const sets: string[] = [];
      const values: unknown[] = [];

      if (params.case_id !== undefined) {
        if (!CASE_ID_PATTERN.test(params.case_id)) {
          return {
            success: false,
            error: { code: ErrorCode.BAD_REQUEST, message: EVAL_MESSAGES.CASE_ID_INVALID },
          };
        }
        const dup = await db.query(
          'SELECT id FROM eval_cases WHERE set_id = ? AND case_id = ? AND id <> ? AND status <> \'deleted\'',
          [ set_id, params.case_id, id ],
        );
        if (dup.rows && dup.rows.length > 0) {
          return {
            success: false,
            error: { code: ErrorCode.CONFLICT, message: EVAL_MESSAGES.CASE_ID_EXISTS },
          };
        }
        sets.push('case_id = ?');
        values.push(params.case_id);
      }
      if (params.question !== undefined) {
        if (params.question.trim() === '') {
          return {
            success: false,
            error: { code: ErrorCode.BAD_REQUEST, message: EVAL_MESSAGES.QUESTION_REQUIRED },
          };
        }
        sets.push('question = ?');
        values.push(params.question.trim());
      }
      if (params.expected_chapter !== undefined) {
        sets.push('expected_chapter = ?');
        values.push(params.expected_chapter ?? null);
      }
      if (params.expected_keywords !== undefined) {
        if (
          !Array.isArray(params.expected_keywords) ||
          params.expected_keywords.length === 0 ||
          !params.expected_keywords.every((k) => typeof k === 'string')
        ) {
          return {
            success: false,
            error: { code: ErrorCode.BAD_REQUEST, message: EVAL_MESSAGES.KEYWORDS_REQUIRED },
          };
        }
        sets.push('expected_keywords = ?');
        values.push(JSON.stringify(params.expected_keywords));
      }
      if (params.category !== undefined) {
        if (!EVAL_CATEGORIES.includes(params.category)) {
          return {
            success: false,
            error: { code: ErrorCode.BAD_REQUEST, message: EVAL_MESSAGES.CATEGORY_INVALID },
          };
        }
        sets.push('category = ?');
        values.push(params.category);
      }
      if (params.sort_order !== undefined) {
        sets.push('sort_order = ?');
        values.push(params.sort_order);
      }
      if (params.status !== undefined) {
        if (!EVAL_SETTABLE_STATUSES.includes(params.status)) {
          return {
            success: false,
            error: { code: ErrorCode.BAD_REQUEST, message: EVAL_MESSAGES.STATUS_INVALID },
          };
        }
        sets.push('status = ?');
        values.push(params.status);
      }
      if (sets.length === 0) return { success: true };

      values.push(id);
      await db.update(`UPDATE eval_cases SET ${sets.join(', ')} WHERE id = ?`, values);
      return { success: true };
    } catch (error) {
      logger.error('更新评估用例失败', { error, caseId: id });
      return {
        success: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message: EVAL_MESSAGES.UPDATE_FAILED },
      };
    }
  }

  /**
   * 删除单条用例（软删除：状态改为 deleted）
   */
  async deleteCase(id: number): Promise<ServiceResult> {
    try {
      const db = getDb();
      const result = await db.update(
        'UPDATE eval_cases SET status = \'deleted\' WHERE id = ? AND status <> \'deleted\'',
        [ id ],
      );
      if (result.affectedRows === 0) {
        return {
          success: false,
          error: { code: ErrorCode.NOT_FOUND, message: EVAL_MESSAGES.CASE_NOT_FOUND },
        };
      }
      return { success: true };
    } catch (error) {
      logger.error('删除评估用例失败', { error, caseId: id });
      return {
        success: false,
        error: { code: ErrorCode.INTERNAL_ERROR, message: EVAL_MESSAGES.DELETE_FAILED },
      };
    }
  }

  /**
   * 导出评估集（示例格式 JSON 数组，供评测脚本使用）
   * 只含 status='normal'（正常）的用例；禁用/已删除的用例不参与评估，故不导出
   */
  async exportSet(id: number): Promise<ServiceResult<EvalCaseInput[]>> {
    const detail = await this.getSetDetail(id);
    if (!detail.success || !detail.data) {
      return { success: false, error: detail.error };
    }
    const data: EvalCaseInput[] = detail.data.cases
      .filter((c) => c.status === 'normal')
      .map((c) => ({
        id: c.case_id,
        question: c.question,
        expected_chapter: c.expected_chapter,
        expected_keywords: c.expected_keywords,
        category: c.category,
      }));
    return { success: true, data };
  }

  /**
   * 一步导入：创建评估集 + 导入用例
   */
  async importSet(
    params: EvalSetImportParams,
  ): Promise<ServiceResult<EvalSetImportData>> {
    const created = await this.createSet({
      name: params.name,
      description: params.description,
      doc_scope: params.doc_scope,
      status: params.status,
    });
    if (!created.success || !created.data) {
      return { success: false, error: created.error };
    }

    const imported = await this.addCases(created.data.id, params.cases);
    if (!imported.success || !imported.data) {
      return { success: false, error: imported.error };
    }

    return {
      success: true,
      data: { set: created.data, import_result: imported.data },
    };
  }

  /**
   * 从已入库文档生成评估集
   * 转发 doc-kit eval/generate（读取保存的解析段落 + LLM 生成）→ 编号/校验 → 一步建集导用例。
   * 权限：eval:write（评估域）；doc:ingest 仅约束"上传入库"，与本接口解耦。
   */
  async generateSetFromDocument(
    docId: string,
    params: { set_name?: string; count?: number } = {},
  ): Promise<ServiceResult<EvalSetImportData & { generate_failures: unknown[] }>> {
    try {
      const gen = await this.callDocKit<{
        filename?: string;
        mode?: string;
        cases?: Array<{
          question: string;
          expected_keywords: string[];
          expected_chapter?: string | null;
          category: string;
        }>;
        failures?: unknown[];
      }>('/doc-kit/api/v1/eval/generate', { task_id: docId, count: params.count });

      const rawCases = gen.cases ?? [];
      if (rawCases.length === 0) {
        return {
          success: false,
          error: {
            code: ErrorCode.BAD_REQUEST,
            message: '未能生成有效用例（生成失败或全部未通过校验）',
          },
        };
      }

      // 编号 T001…T0N，保持集内唯一；字段沿用导入校验语义
      const cases: EvalCaseInput[] = rawCases.map((c, i) => ({
        id: `T${String(i + 1).padStart(3, '0')}`,
        question: c.question,
        expected_keywords: c.expected_keywords ?? [],
        expected_chapter: c.expected_chapter ?? null,
        category: c.category,
      }));

      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
      const name = params.set_name?.trim() || `自动-${gen.filename || docId}-${stamp}`;

      const imported = await this.importSet({
        name,
        doc_scope: gen.filename || docId,
        cases,
      });
      if (!imported.success || !imported.data) {
        return { success: false, error: imported.error };
      }

      return {
        success: true,
        data: { ...imported.data, generate_failures: gen.failures ?? [] },
      };
    } catch (error) {
      logger.error('生成评估集失败', { error, docId });
      return {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: `生成评估集失败: ${(error as Error).message}`,
        },
      };
    }
  }

  /** doc-kit 服务间 JSON 调用（fetch；生成可能耗时，超时 5 分钟） */
  private async callDocKit<T>(path: string, body?: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5 * 60 * 1000);
    try {
      const resp = await fetch(`${envConfig.docKitUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers:
          body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const data = (await resp.json()) as { status?: number; msg?: string; data?: T };
      if (!resp.ok || data.status !== 200) {
        throw new Error(data.msg || `doc-kit 返回 ${resp.status}`);
      }
      return data.data as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

export const evalSetService = new EvalSetService();
