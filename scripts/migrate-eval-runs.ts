/// <reference types="node" />

/**
 * 评估历史迁移脚本：把本地 MySQL 的评估运行记录迁移到服务端 MySQL
 *
 * 迁移范围：
 *   - eval_sets        （评估集：目标按 name 唯一键同步，保证 eval_runs.set_id 外键可解析）
 *   - eval_runs        （评估运行头：按 timestamp + set_name 去重，幂等可重复执行）
 *   - eval_run_cases   （运行用例明细：随对应 run 一并迁移）
 *
 * 用法（在 services/core 目录下）：
 *   # 目标/源库均通过环境变量指定；SRC_* 缺省回落到 DB_*（本地配置）
 *   $env:SRC_DB_HOST="127.0.0.1"; $env:SRC_DB_PORT="3306"; $env:SRC_DB_USER="datapolit-core"; $env:SRC_DB_PASSWORD="core_password"; $env:SRC_DB_NAME="datapolit"
 *   $env:DST_DB_HOST="<服务端IP/域名>"; $env:DST_DB_PORT="3306"; $env:DST_DB_USER="datapolit-core"; $env:DST_DB_PASSWORD="..."; $env:DST_DB_NAME="datapolit"
 *   npx ts-node scripts/migrate-eval-runs.ts            # 正式迁移
 *   npx ts-node scripts/migrate-eval-runs.ts --dry-run  # 只统计不写入
 *
 * 说明：
 *   - 目标表不存在时自动幂等建表（复用 ensureSchema）；
 *   - 单条 run 与其明细在同一事务内写入，失败自动回滚并记录，不影响其余；
 *   - 目标已存在相同 (timestamp, set_name) 的 run 则跳过（重复执行安全）。
 */

import { MySQLAdapter } from "../src/database/MySQLAdapter";
import { ensureSchema } from "../src/database/ensureSchema";

// ============ 配置（环境变量） ============
const srcHost = process.env.SRC_DB_HOST || process.env.DB_HOST || "127.0.0.1";
const srcPort = Number(process.env.SRC_DB_PORT || process.env.DB_PORT || 3306);
const srcUser = process.env.SRC_DB_USER || process.env.DB_USER || "datapolit-core";
const srcPassword = process.env.SRC_DB_PASSWORD || process.env.DB_PASSWORD || "";
const srcName = process.env.SRC_DB_NAME || process.env.DB_NAME || "datapolit";

const dstHost = process.env.DST_DB_HOST || "";
const dstPort = Number(process.env.DST_DB_PORT || 3306);
const dstUser = process.env.DST_DB_USER || process.env.DB_USER || "datapolit-core";
const dstPassword = process.env.DST_DB_PASSWORD || process.env.DB_PASSWORD || "";
const dstName = process.env.DST_DB_NAME || process.env.DB_NAME || "datapolit";

const DRY_RUN = process.argv.includes("--dry-run");

/** JSON 列兼容：mysql2 可能返回字符串或已解析对象，统一转成可入库的 JSON 字符串 */
function toJson(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** 数值/字符串安全转换 */
function num(v: unknown): number {
  return v === null || v === undefined ? 0 : Number(v);
}
function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

/** DATETIME 列安全转换：mysql2 会把 DATETIME 解析成 JS Date，需格式化为 YYYY-MM-DD HH:MM:SS */
function toDatetime(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return (
      `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ` +
      `${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`
    );
  }
  return String(v);
}

async function main(): Promise<void> {
  if (!dstHost) {
    console.error("缺少目标库配置：请设置 DST_DB_HOST（以及 DST_DB_USER/PASSWORD/NAME）");
    process.exit(1);
  }

  console.log(`源库   : ${srcHost}:${srcPort}/${srcName}`);
  console.log(`目标库 : ${dstHost}:${dstPort}/${dstName}`);
  console.log(`模式   : ${DRY_RUN ? "DRY-RUN（只统计不写入）" : "正式迁移"}`);
  console.log("");

  const src = new MySQLAdapter({
    host: srcHost, port: srcPort, user: srcUser, password: srcPassword, database: srcName,
  });
  const dst = new MySQLAdapter({
    host: dstHost, port: dstPort, user: dstUser, password: dstPassword, database: dstName,
  });

  await src.initialize();
  await dst.initialize();

  // 目标表兜底：确保 eval_sets / eval_runs / eval_run_cases 存在
  if (!DRY_RUN) {
    await ensureSchema(dst);
  }

  const stats = {
    sets_synced: 0,
    runs_total: 0,
    runs_inserted: 0,
    runs_skipped: 0,
    cases_inserted: 0,
    failures: [] as string[],
  };

  // ---- 1. 同步 eval_sets（按 name 唯一键），建立 srcId -> dstId 映射 ----
  const setMap = new Map<number, number | null>();
  const setsResult = await src.query(`SELECT * FROM eval_sets ORDER BY id`);
  for (const row of (setsResult.rows || [])) {
    const r = row as Record<string, unknown>;
    const srcId = Number(r.id);
    const name = String(r.name);
    if (!DRY_RUN) {
      await dst.insert(
        `INSERT IGNORE INTO eval_sets (name, description, doc_scope, status) VALUES (?, ?, ?, ?)`,
        [name, str(r.description), str(r.doc_scope), str(r.status) || 'normal'],
      );
    }
    const found = await dst.query(`SELECT id FROM eval_sets WHERE name = ? LIMIT 1`, [name]);
    const dstId = found.rows?.[0] ? Number((found.rows[0] as Record<string, unknown>).id) : null;
    setMap.set(srcId, dstId);
    stats.sets_synced += 1;
  }

  // ---- 2. 迁移 eval_runs + eval_run_cases（单 run 一个事务，按 timestamp+set_name 去重） ----
  const runsResult = await src.query(`SELECT * FROM eval_runs ORDER BY id`);
  stats.runs_total = (runsResult.rows || []).length;

  for (const row of (runsResult.rows || [])) {
    const r = row as Record<string, unknown>;
    const srcRunId = Number(r.id);
    const timestamp = str(r.timestamp);
    const setName = str(r.set_name);

    // 幂等：目标已有相同 (timestamp, set_name) 则跳过
    const dup = await dst.query(
      `SELECT id FROM eval_runs WHERE timestamp <=> ? AND set_name <=> ? LIMIT 1`,
      [timestamp, setName],
    );
    if (dup.rows && dup.rows.length > 0) {
      stats.runs_skipped += 1;
      continue;
    }

    // set_id 映射：源集在目标不存在时置 NULL（保留 set_name 快照）
    const srcSetId = r.set_id === null || r.set_id === undefined ? null : Number(r.set_id);
    const mappedSetId = srcSetId === null ? null : (setMap.get(srcSetId) ?? null);

    try {
      if (DRY_RUN) {
        stats.runs_inserted += 1;
        continue;
      }

      await dst.withTransaction(async (tx) => {
        const insertResult = await tx.insert(
          `INSERT INTO eval_runs
             (set_id, set_name, doc_scope, status, timestamp, total, passed, avg_score,
              avg_elapsed, pass_rate, category_stats, failed_cases, raw_report, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            mappedSetId,
            setName,
            str(r.doc_scope),
            str(r.status) || 'completed',
            timestamp,
            num(r.total),
            num(r.passed),
            Number(r.avg_score ?? 0),
            Number(r.avg_elapsed ?? 0),
            str(r.pass_rate),
            toJson(r.category_stats),
            toJson(r.failed_cases),
            toJson(r.raw_report),
            toDatetime(r.created_at),
            toDatetime(r.updated_at),
          ],
        );
        const newRunId = insertResult.insertId;
        if (!newRunId) throw new Error('插入 eval_runs 失败');

        // 迁移该 run 的用例明细
        const casesResult = await src.query(
          `SELECT * FROM eval_run_cases WHERE run_id = ? ORDER BY id`,
          [srcRunId],
        );
        for (const c of (casesResult.rows || [])) {
          const cc = c as Record<string, unknown>;
          await tx.insert(
            `INSERT INTO eval_run_cases
               (run_id, case_id, question, score, elapsed, keywords_found, keyword_count,
                source_count, has_answer, chapter_match, answer_preview, error)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              newRunId,
              String(cc.case_id),
              String(cc.question ?? ''),
              cc.score === null || cc.score === undefined ? null : Number(cc.score),
              cc.elapsed === null || cc.elapsed === undefined ? null : Number(cc.elapsed),
              toJson(cc.keywords_found),
              num(cc.keyword_count),
              num(cc.source_count),
              num(cc.has_answer),
              cc.chapter_match === null || cc.chapter_match === undefined
                ? null
                : num(cc.chapter_match),
              str(cc.answer_preview),
              str(cc.error),
            ],
          );
          stats.cases_inserted += 1;
        }
      });

      stats.runs_inserted += 1;
    } catch (error) {
      const message = (error as Error).message;
      stats.failures.push(`run#${srcRunId} (${timestamp}): ${message}`);
      console.error(`  迁移失败 run#${srcRunId}: ${message}`);
    }
  }

  // ---- 3. 汇总 ----
  console.log("");
  console.log("===== 迁移结果 =====");
  console.log(`评估集同步   : ${stats.sets_synced}`);
  console.log(`运行总数     : ${stats.runs_total}`);
  console.log(`已插入       : ${stats.runs_inserted}`);
  console.log(`已跳过(重复) : ${stats.runs_skipped}`);
  console.log(`用例明细插入 : ${stats.cases_inserted}`);
  if (stats.failures.length > 0) {
    console.log(`失败 ${stats.failures.length} 条:`);
    for (const f of stats.failures) console.log(`  - ${f}`);
  }
  if (DRY_RUN) {
    console.log("（DRY-RUN 模式：未写入任何数据）");
  }

  await src.close();
  await dst.close();
}

main().catch((error) => {
  console.error("脚本执行失败:", error);
  process.exit(1);
});
