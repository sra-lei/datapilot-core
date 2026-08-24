/**
 * 评估报告模块 - 服务层
 * 评估集运行结果入库（MySQL: eval_runs / eval_run_cases）后，从库聚合返回 history + latest；
 * 支持在线运行评估集：从评估集取用例 → 调 docs-seeker /v1/chat 评测 → 结果入库。
 */

import { ErrorCode } from "../../constants";
import { DatabaseFactory, QueryRow } from "../../database";
import { envConfig, logger } from "../../utils";
import { evalSetService } from "../eval-set/service";
import { EVAL_RUN_MESSAGES } from "./constants";
import {
  EvalHistoryItem,
  EvalReportInput,
  EvalReportResultItem,
  EvalRun,
  EvalRunCaseRow,
  EvalRunDetail,
  EvalRunImportResult,
  EvalRunListData,
  EvalRunSetResult,
  EvalStatsData,
  ServiceResult,
} from "./types";

function getDb() {
  return DatabaseFactory.getInstance();
}

/** 解析库内 JSON 字段（兼容字符串与已解析对象两种形态，mysql2 对 JSON 列返回形态存在驱动差异） */
function parseJsonField<T>(raw: unknown, fallback: T): T {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

/** 生成与脚本一致的报告时间戳 YYYYMMDD_HHMMSS */
function nowTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
    `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/** eval_runs 行 → EvalRun */
function mapRunRow(row: QueryRow): EvalRun {
  return {
    id: Number(row.id),
    set_id: row.set_id !== null && row.set_id !== undefined ? Number(row.set_id) : null,
    set_name: row.set_name ? String(row.set_name) : null,
    doc_scope: row.doc_scope ? String(row.doc_scope) : null,
    status: String(row.status ?? 'completed'),
    timestamp: row.timestamp ? String(row.timestamp) : null,
    total: Number(row.total || 0),
    passed: Number(row.passed || 0),
    avg_score: Number(row.avg_score || 0),
    avg_elapsed: Number(row.avg_elapsed || 0),
    pass_rate: row.pass_rate ? String(row.pass_rate) : null,
    category_stats: parseJsonField<Record<string, unknown>>(row.category_stats, {}),
    failed_cases: parseJsonField<unknown[]>(row.failed_cases, []),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

/** eval_run_cases 行 → EvalRunCaseRow */
function mapCaseRow(row: QueryRow): EvalRunCaseRow {
  return {
    id: Number(row.id),
    run_id: Number(row.run_id),
    case_id: String(row.case_id),
    question: String(row.question ?? ''),
    score: row.score !== null && row.score !== undefined ? Number(row.score) : null,
    elapsed: row.elapsed !== null && row.elapsed !== undefined ? Number(row.elapsed) : null,
    keywords_found: parseJsonField<string[]>(row.keywords_found, []),
    keyword_count: Number(row.keyword_count || 0),
    source_count: Number(row.source_count || 0),
    has_answer: Number(row.has_answer || 0) === 1,
    chapter_match:
      row.chapter_match === null || row.chapter_match === undefined
        ? null
        : Number(row.chapter_match) === 1,
    answer_preview: row.answer_preview ? String(row.answer_preview) : null,
    error: row.error ? String(row.error) : null,
  };
}

export class EvalService {
  /**
   * 获取评估集历史趋势与最新详情
   * 查库（eval_runs）聚合返回 history + latest
   */
  async getEvalStats(): Promise<ServiceResult<EvalStatsData>> {
    try {
      const db = getDb();
      const rowsResult = await db.query(
        `SELECT id, timestamp, avg_score, avg_elapsed, total, passed, category_stats
         FROM eval_runs ORDER BY id ASC`,
      );
      const rows = rowsResult.rows || [];

      const history: EvalHistoryItem[] = rows.map((r) => {
        const row = r as QueryRow;
        return {
          timestamp: String(row.timestamp ?? ''),
          avg_score: Number(row.avg_score || 0),
          avg_elapsed: Number(row.avg_elapsed || 0),
          total: Number(row.total || 0),
          passed: Number(row.passed || 0),
          category_stats: parseJsonField<Record<string, unknown>>(row.category_stats, {}),
        };
      });

      // 最新一次运行：取整份原始报告快照（byte 级一致）
      const latestResult = await db.query(
        `SELECT raw_report FROM eval_runs ORDER BY id DESC LIMIT 1`,
      );
      const latestRow = latestResult.rows?.[0] as QueryRow | undefined;
      const latest = latestRow
        ? parseJsonField<Record<string, unknown> | null>(latestRow.raw_report, null)
        : null;

      return { success: true, data: { history, latest } };
    } catch (error) {
      logger.error('获取评估报告失败（查库）', { error });
      return {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: `获取评估报告失败: ${(error as Error).message}`,
        },
      };
    }
  }

  /**
   * 单份评估报告入库（事务：run 头 + 用例明细原子写入）
   */
  async createRun(input: EvalReportInput): Promise<ServiceResult<{ run_id: number }>> {
    const results = Array.isArray(input?.results) ? input.results : null;
    if (!results || results.length === 0) {
      return {
        success: false,
        error: { code: ErrorCode.BAD_REQUEST, message: EVAL_RUN_MESSAGES.RESULTS_REQUIRED },
      };
    }

    try {
      const db = getDb();
      const runId = await db.withTransaction(async (tx) => {
        // 宽松入库：缺失字段按 results 实际值兜底计算
        const total = results.length;
        const passed = Number.isFinite(Number(input.passed))
          ? Number(input.passed)
          : results.filter((r) => Number(r?.score ?? 0) >= 0.8).length;
        const avgScore = Number.isFinite(Number(input.avg_score))
          ? Number(input.avg_score)
          : total > 0
            ? results.reduce((sum, r) => sum + Number(r?.score ?? 0), 0) / total
            : 0;
        const avgElapsed = Number.isFinite(Number(input.avg_elapsed))
          ? Number(input.avg_elapsed)
          : results.reduce((sum, r) => sum + Number(r?.elapsed ?? 0), 0) /
            (results.length || 1);

        const timestamp = input.timestamp || nowTimestamp();
        const categoryStats = input.summary?.category_stats ?? {};
        const failedCases = input.summary?.failed_cases ?? [];

        const insertResult = await tx.insert(
          `INSERT INTO eval_runs
             (set_id, set_name, doc_scope, status, timestamp, total, passed, avg_score,
              avg_elapsed, pass_rate, category_stats, failed_cases, raw_report)
           VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.set_id ?? null,
            input.set_name ?? null,
            input.doc_scope ?? null,
            timestamp,
            total,
            passed,
            avgScore,
            avgElapsed,
            input.summary?.pass_rate ?? null,
            JSON.stringify(categoryStats),
            JSON.stringify(failedCases),
            JSON.stringify(input),
          ],
        );
        const runId = insertResult.insertId;
        if (!runId) {
          throw new Error('插入评估运行失败');
        }

        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          const hasError = Boolean(r?.error);
          const hasAnswer =
            r?.has_answer === undefined
              ? hasError
                ? 0
                : 1
              : r.has_answer
                ? 1
                : 0;
          await tx.insert(
            `INSERT INTO eval_run_cases
               (run_id, case_id, question, score, elapsed, keywords_found, keyword_count,
                source_count, has_answer, chapter_match, answer_preview, error)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              runId,
              String(r?.id ?? `case_${i + 1}`),
              String(r?.question ?? ''),
              typeof r?.score === 'number' ? r.score : null,
              typeof r?.elapsed === 'number' ? r.elapsed : null,
              JSON.stringify(r?.keywords_found ?? []),
              Number(r?.keyword_count ?? r?.keywords_found?.length ?? 0),
              Number(r?.source_count ?? 0),
              hasAnswer,
              r?.chapter_match === undefined || r?.chapter_match === null
                ? null
                : r.chapter_match
                  ? 1
                  : 0,
              r?.answer_preview ?? null,
              r?.error ?? null,
            ],
          );
        }

        return runId;
      });

      return { success: true, data: { run_id: runId } };
    } catch (error) {
      logger.error('评估结果入库失败', { error });
      return {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: `${EVAL_RUN_MESSAGES.IMPORT_FAILED}: ${(error as Error).message}`,
        },
      };
    }
  }

  /**
   * 批量导入多份评估报告（逐份独立事务，单份失败不影响其余）
   */
  async createRunsBatch(list: EvalReportInput[]): Promise<ServiceResult<EvalRunImportResult>> {
    if (!Array.isArray(list) || list.length === 0) {
      return {
        success: false,
        error: { code: ErrorCode.BAD_REQUEST, message: EVAL_RUN_MESSAGES.RESULTS_TYPE_INVALID },
      };
    }

    const result: EvalRunImportResult = { total: list.length, inserted: 0, failures: [] };

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      try {
        const created = await this.createRun(item);
        if (created.success && created.data) {
          result.inserted += 1;
        } else {
          result.failures.push({
            index: i,
            reason: created.error?.message ?? '导入失败',
          });
        }
      } catch (error) {
        result.failures.push({
          index: i,
          reason: (error as Error).message,
        });
      }
    }

    return { success: true, data: result };
  }

  /**
   * 在线运行评估集：取集内 normal 用例 → 逐条调 docs-seeker /v1/chat 评测（移植 test_chat.py 评分逻辑）
   * → 汇总报告 → 复用 createRun 入库，返回运行摘要。
   */
  async runSet(setId: number): Promise<ServiceResult<EvalRunSetResult>> {
    const detail = await evalSetService.getSetDetail(setId);
    if (!detail.success || !detail.data) {
      return { success: false, error: detail.error };
    }

    const cases = detail.data.cases.filter((c) => c.status === 'normal');
    if (cases.length === 0) {
      return {
        success: false,
        error: { code: ErrorCode.BAD_REQUEST, message: EVAL_RUN_MESSAGES.NO_RUNNABLE_CASES },
      };
    }

    const results: Array<{
      id: string;
      question: string;
      category: string;
      score?: number;
      elapsed?: number;
      keywords_found?: string[];
      keyword_count?: number;
      source_count?: number;
      has_answer?: boolean;
      chapter_match?: boolean | null;
      answer_preview?: string;
      error?: string;
    }> = [];

    for (const c of cases) {
      const start = Date.now();
      try {
        const { answer, sources } = await this.chatQuestion(c.question);
        const elapsed = (Date.now() - start) / 1000;
        const keywords_found = c.expected_keywords.filter((kw) => answer.includes(kw));
        let score = keywords_found.length / Math.max(1, c.expected_keywords.length);
        const chapter_match = c.expected_chapter
          ? answer.includes(c.expected_chapter) ||
            sources.some((s) => (s.chapter ?? '').includes(c.expected_chapter as string))
          : null;
        if (c.expected_chapter && chapter_match === false) {
          score *= 0.7; // 章节不匹配扣分（与 test_chat.py 一致）
        }
        const has_answer = Boolean(answer);
        if (!has_answer) score = 0;

        results.push({
          id: c.case_id,
          question: c.question,
          category: c.category,
          score,
          elapsed,
          keywords_found,
          keyword_count: keywords_found.length,
          source_count: sources.length,
          has_answer,
          chapter_match,
          answer_preview: answer.slice(0, 100) + (answer.length > 100 ? '...' : ''),
        });
      } catch (error) {
        const elapsed = (Date.now() - start) / 1000;
        logger.error('评估用例执行失败', { error, caseId: c.case_id });
        results.push({
          id: c.case_id,
          question: c.question,
          category: c.category,
          score: 0,
          elapsed,
          error: (error as Error).message,
        });
      }
    }

    // ---- 汇总统计（口径与 test_chat.py 一致）----
    const total = results.length;
    const passed = results.filter((r) => (r.score ?? 0) >= 0.8).length;
    const avgScore = results.reduce((s, r) => s + (r.score ?? 0), 0) / total;
    const avgElapsed = results.reduce((s, r) => s + (r.elapsed ?? 0), 0) / total;

    const categoryStats: Record<string, { count: number; avg_score: number }> = {};
    for (const r of results) {
      const cat = r.category || '未分类';
      if (!categoryStats[cat]) categoryStats[cat] = { count: 0, avg_score: 0 };
      categoryStats[cat].count += 1;
      categoryStats[cat].avg_score += r.score ?? 0;
    }
    for (const cat of Object.keys(categoryStats)) {
      categoryStats[cat].avg_score /= categoryStats[cat].count;
    }

    const failedCases = results
      .filter((r) => !r.error && (r.score ?? 0) < 0.5)
      .map((r) => ({
        id: r.id,
        question: (r.question ?? '').slice(0, 30) + '...',
        score: r.score ?? 0,
      }));

    const report: EvalReportInput = {
      timestamp: nowTimestamp(),
      set_id: setId,
      set_name: detail.data.set.name,
      doc_scope: detail.data.set.doc_scope ?? undefined,
      total,
      passed,
      avg_score: avgScore,
      avg_elapsed: avgElapsed,
      summary: {
        total_cases: total,
        passed_count: passed,
        pass_rate: `${((passed / total) * 100).toFixed(1)}%`,
        avg_score: `${(avgScore * 100).toFixed(1)}%`,
        avg_elapsed: `${avgElapsed.toFixed(2)}s`,
        category_stats: categoryStats,
        failed_cases: failedCases,
      },
      results: results as EvalReportResultItem[],
    };

    const created = await this.createRun(report);
    if (!created.success || !created.data) {
      return { success: false, error: created.error };
    }

    return {
      success: true,
      data: {
        run_id: created.data.run_id,
        set_id: setId,
        set_name: detail.data.set.name,
        total,
        passed,
        avg_score: avgScore,
        avg_elapsed: avgElapsed,
        failed_count: failedCases.length,
      },
    };
  }

  /**
   * 调 docs-seeker /v1/chat（普通 JSON POST），返回回答文本与引用来源
   */
  private async chatQuestion(question: string): Promise<{
    answer: string;
    sources: Array<{ chapter?: string }>;
  }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), envConfig.docsSeekerTimeoutMs);
    try {
      const resp = await fetch(`${envConfig.docsSeekerUrl}/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, use_cache: true }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        throw new Error(`docs-seeker /v1/chat 返回 ${resp.status}`);
      }
      const data = (await resp.json()) as {
        answer?: string;
        sources?: Array<{ chapter?: string }>;
      };
      return { answer: data.answer ?? '', sources: data.sources ?? [] };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * 运行历史分页列表
   */
  async listRuns(params?: {
    set_id?: number;
    page?: number;
    page_size?: number;
  }): Promise<ServiceResult<EvalRunListData>> {
    try {
      const db = getDb();
      const page = Math.max(1, params?.page || 1);
      const pageSize = Math.min(100, Math.max(1, params?.page_size || 20));
      const offset = (page - 1) * pageSize;
      const where = params?.set_id ? 'WHERE set_id = ?' : '';
      const whereParams = params?.set_id ? [params.set_id] : [];

      const countResult = await db.query(
        `SELECT COUNT(*) AS count FROM eval_runs ${where}`,
        whereParams,
      );
      const total = Number((countResult.rows?.[0] as QueryRow)?.count || 0);

      const listResult = await db.query(
        `SELECT * FROM eval_runs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
        [...whereParams, pageSize, offset],
      );

      const list = (listResult.rows || []).map((r) => mapRunRow(r as QueryRow));

      return { success: true, data: { list, total, page, page_size: pageSize } };
    } catch (error) {
      logger.error('获取运行历史失败', { error });
      return {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: EVAL_RUN_MESSAGES.LIST_FAILED,
        },
      };
    }
  }

  /**
   * 单次运行详情（含用例明细与整份原始报告）
   */
  async getRun(id: number): Promise<ServiceResult<EvalRunDetail>> {
    try {
      const db = getDb();
      const runResult = await db.query(`SELECT * FROM eval_runs WHERE id = ?`, [id]);
      const runRow = runResult.rows?.[0] as QueryRow | undefined;
      if (!runRow) {
        return {
          success: false,
          error: { code: ErrorCode.NOT_FOUND, message: EVAL_RUN_MESSAGES.RUN_NOT_FOUND },
        };
      }

      const casesResult = await db.query(
        `SELECT * FROM eval_run_cases WHERE run_id = ? ORDER BY id ASC`,
        [id],
      );

      const run = mapRunRow(runRow);
      return {
        success: true,
        data: {
          ...run,
          cases: (casesResult.rows || []).map((r) => mapCaseRow(r as QueryRow)),
          raw_report: parseJsonField<unknown>(runRow.raw_report, null),
        },
      };
    } catch (error) {
      logger.error('获取评估运行失败', { error, runId: id });
      return {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: `获取评估运行失败: ${(error as Error).message}`,
        },
      };
    }
  }

  /**
   * 删除一次运行（级联删除用例明细）
   */
  async deleteRun(id: number): Promise<ServiceResult<null>> {
    try {
      const db = getDb();
      const result = await db.delete(`DELETE FROM eval_runs WHERE id = ?`, [id]);
      if (!result.affectedRows || result.affectedRows === 0) {
        return {
          success: false,
          error: { code: ErrorCode.NOT_FOUND, message: EVAL_RUN_MESSAGES.RUN_NOT_FOUND },
        };
      }
      return { success: true, data: null };
    } catch (error) {
      logger.error('删除评估运行失败', { error, runId: id });
      return {
        success: false,
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: EVAL_RUN_MESSAGES.DELETE_FAILED,
        },
      };
    }
  }
}

export const evalService = new EvalService();
