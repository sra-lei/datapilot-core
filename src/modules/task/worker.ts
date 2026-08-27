/**
 * 任务中心模块 - 进程内 worker（P1/P2：单实例串行队列 + EVAL_CONCURRENCY 并发上限）
 *
 * 职责：
 * - 启动恢复（P7 风险应对）：进程重启把 queued/running 置为 failed，提供重试
 * - 保留策略清理（P6）：成功 7 天、失败/取消 30 天
 * - eval_run：逐用例调 docs-seeker，每完成一个用例更新 progress + 取消检查
 * - eval_set_generate：提交 doc-kit 异步生成任务 → 轮询镜像进度 → 编号校验 → 建集导入
 */

import { logger } from '../../utils';
import { docKitRequest, sleep } from '../../utils/docKitClient';
import { evalSetService } from '../eval-set/service';
import { evalService } from '../eval/service';
import { Task } from './types';
import { taskService } from './service';

/** doc-kit 生成任务轮询间隔（进度粒度：章节/批次） */
const EVAL_GEN_POLL_INTERVAL_MS = 2000;
/** doc-kit 生成任务轮询上限（15 分钟；LLM 生成超时即失败） */
const EVAL_GEN_MAX_POLLS = Math.floor((15 * 60 * 1000) / EVAL_GEN_POLL_INTERVAL_MS);
/** 保留策略清理周期 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/** doc-kit 异步生成任务状态（core 只关心这些字段） */
type DocKitGenerateTask = {
  status?: string;
  progress?: number;
  progress_detail?: Record<string, unknown> | null;
  result?: {
    filename?: string;
    mode?: string;
    cases?: Array<{
      question: string;
      expected_keywords: string[];
      expected_chapter?: string | null;
      category: string;
    }>;
    failures?: unknown[];
  } | null;
  error?: string | null;
};

class TaskWorker {
  private queue: number[] = [];
  private processing = false;
  private initialized = false;

  /** 服务启动时调用一次：启动恢复 + 定时清理 */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    void taskService
      .startupRecovery()
      .then((n) => {
        if (n > 0) {
          logger.warn(`[task-worker] 启动恢复：${n} 个中断任务置为 failed，可在任务中心重试`);
        }
      })
      .catch((error) => logger.error('[task-worker] 启动恢复失败', { error }));

    setInterval(() => {
      void taskService
        .cleanup()
        .then((n) => {
          if (n > 0) logger.info(`[task-worker] 清理过期任务 ${n} 条`);
        })
        .catch((error) => logger.error('[task-worker] 任务清理失败', { error }));
    }, CLEANUP_INTERVAL_MS);
  }

  /** 提交任务到串行队列（createTask 成功后调用） */
  enqueue(taskId: number): void {
    this.queue.push(taskId);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (this.queue.length > 0) {
        const taskId = this.queue.shift()!;
        const task = await taskService.getTaskForWorker(taskId);
        if (!task) continue;
        // 排队期间被取消的任务跳过执行
        if (task.status !== 'queued') continue;
        try {
          await taskService.markRunning(taskId);
          if (task.task_type === 'eval_run') {
            await this.executeEvalRun(task);
          } else if (task.task_type === 'eval_set_generate') {
            await this.executeEvalSetGenerate(task);
          } else {
            await taskService.fail(taskId, `未知任务类型: ${task.task_type}`);
          }
        } catch (error) {
          logger.error('[task-worker] 任务执行异常', {
            error,
            taskId,
            taskType: task.task_type,
          });
          await taskService.fail(taskId, (error as Error).message || '任务执行异常');
        }
      }
    } finally {
      this.processing = false;
    }
  }

  /** eval_run：逐用例评测，每完成一个用例更新 progress；取消后不写结果 */
  private async executeEvalRun(task: Task): Promise<void> {
    const set_id = Number(task.payload?.set_id);
    if (!Number.isFinite(set_id)) {
      await taskService.fail(task.id, '任务入参无效：set_id 缺失');
      return;
    }

    const executed = await evalService.runSetCases(set_id, {
      onCaseDone: ({ done, total, current, passed }) => {
        void taskService.updateProgress(
          task.id,
          Math.round((done / Math.max(1, total)) * 100),
          {
            phase: 'running',
            done,
            total,
            current,
            passed,
          },
        );
      },
      shouldStop: () => taskService.shouldCancel(task.id),
    });

    if (!executed.success || !executed.data) {
      await taskService.fail(task.id, executed.error?.message || '评估运行失败');
      return;
    }

    // 取消竞态（P7）：worker 在用例边界检查标志位；取消后不再写结果
    if (await taskService.shouldCancel(task.id)) {
      await taskService.markCancelled(task.id);
      return;
    }

    const created = await evalService.createRun(executed.data.report);
    if (!created.success || !created.data) {
      await taskService.fail(task.id, created.error?.message || '评估结果入库失败');
      return;
    }

    await taskService.complete(task.id, {
      run_id: created.data.run_id,
      ...executed.data.summary,
    });
  }

  /** eval_set_generate：doc-kit 异步生成 + 轮询镜像进度 + 编号校验 + 建集导入 */
  private async executeEvalSetGenerate(task: Task): Promise<void> {
    const payload = task.payload ?? {};
    const docId = String(payload.doc_id ?? '').trim();
    if (!docId) {
      await taskService.fail(task.id, '任务入参无效：doc_id 缺失');
      return;
    }

    try {
      // 1) 提交 doc-kit 异步生成任务
      const submitted = await docKitRequest<{ task_id: string; status?: string }>(
        '/doc-kit/api/v1/eval/generate/task',
        {
          method: 'POST',
          body: {
            task_id: docId,
            count:
              payload.count !== undefined && payload.count !== null
                ? Number(payload.count)
                : undefined,
          },
          timeoutMs: 5 * 60 * 1000,
        },
      );
      const dkTaskId = submitted.task_id;
      if (!dkTaskId) {
        await taskService.fail(task.id, 'doc-kit 未返回生成任务 id');
        return;
      }

      // 2) 轮询 doc-kit 进度并镜像（阶段权重：parsing 5% → generating 5~90% → importing 95% → 100%）
      let dk: DocKitGenerateTask | null = null;
      for (let i = 0; i < EVAL_GEN_MAX_POLLS; i++) {
        if (await taskService.shouldCancel(task.id)) {
          // P7：取消生成任务 = 丢弃 doc-kit 生成任务结果
          await taskService.markCancelled(task.id);
          return;
        }
        await sleep(EVAL_GEN_POLL_INTERVAL_MS);
        dk = await docKitRequest<DocKitGenerateTask>(
          `/doc-kit/api/v1/eval/generate/task/${dkTaskId}`,
        );
        if (dk.status === 'success') break;
        if (dk.status === 'error') {
          await taskService.fail(task.id, dk.error || 'doc-kit 生成任务失败');
          return;
        }
        const dkProgress = Math.max(0, Math.min(100, Number(dk.progress ?? 0)));
        const detail = dk.progress_detail ?? {};
        await taskService.updateProgress(task.id, Math.round(5 + (dkProgress / 100) * 85), {
          phase: 'generating',
          filename: detail.filename ?? null,
          phase_progress: detail.phase_progress ?? null,
          mode: detail.mode ?? null,
          current_chapter: detail.current_chapter ?? null,
        });
      }
      if (!dk || dk.status !== 'success') {
        await taskService.fail(task.id, 'doc-kit 生成任务超时（15 分钟），请重试');
        return;
      }
      if (await taskService.shouldCancel(task.id)) {
        await taskService.markCancelled(task.id);
        return;
      }

      // 3) 编号校验 → 一步建集导用例（复用评估集服务，与旧同步路径同口径）
      await taskService.updateProgress(task.id, 95, { phase: 'importing' });
      const gen = dk.result ?? {};
      const rawCases = gen.cases ?? [];
      if (rawCases.length === 0) {
        await taskService.fail(task.id, '未能生成有效用例（生成失败或全部未通过校验）');
        return;
      }
      const cases = rawCases.map((c, i) => ({
        id: `T${String(i + 1).padStart(3, '0')}`,
        question: c.question,
        expected_keywords: c.expected_keywords ?? [],
        expected_chapter: c.expected_chapter ?? null,
        category: c.category,
      }));
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`;
      const name =
        typeof payload.set_name === 'string' && payload.set_name.trim()
          ? payload.set_name.trim()
          : `自动-${gen.filename || docId}-${stamp}`;

      const imported = await evalSetService.importSet({
        name,
        doc_scope: gen.filename || docId,
        cases,
      });
      if (!imported.success || !imported.data) {
        await taskService.fail(task.id, imported.error?.message || '建集导入失败');
        return;
      }

      await taskService.complete(task.id, {
        set_id: imported.data.set.id,
        name: imported.data.set.name,
        import_result: imported.data.import_result,
        generate_failures: gen.failures ?? [],
      });
    } catch (error) {
      logger.error('[task-worker] 生成评估集任务失败', { error, taskId: task.id });
      await taskService.fail(task.id, `生成评估集失败: ${(error as Error).message}`);
    }
  }
}

export const taskWorker = new TaskWorker();
