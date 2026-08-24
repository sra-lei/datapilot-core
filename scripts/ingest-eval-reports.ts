/**
 * 一次性存量回灌脚本：读取 data/reports/test_report_*.json → 批量入库 eval_runs
 *
 * 用法（在 services/core 目录下）：
 *   npx ts-node scripts/ingest-eval-reports.ts            # 只入库
 *   npx ts-node scripts/ingest-eval-reports.ts --delete   # 入库并删除原文件
 *
 * 说明：默认读取环境变量 DB_* 连接 MySQL；本机调试可临时覆盖：
 *   DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=... DB_PASSWORD=... DB_NAME=... npx ts-node ...
 */

import fs from "fs";
import path from "path";
import { DatabaseFactory } from "../src/database";
import { ensureSchema } from "../src/database/ensureSchema";
import { evalService } from "../src/modules/eval/service";
import { EvalReportInput } from "../src/modules/eval/types";

async function main(): Promise<void> {
  const deleteAfter = process.argv.includes("--delete");

  // 幂等建表（eval_runs / eval_run_cases 及其余缺失表）
  const db = await DatabaseFactory.initialize();
  await ensureSchema(db);

  const reportDir = path.resolve(process.cwd(), "data/reports");
  if (!fs.existsSync(reportDir)) {
    console.log("未找到 data/reports 目录");
    return;
  }

  const files = fs
    .readdirSync(reportDir)
    .filter((f) => f.startsWith("test_report_") && f.endsWith(".json"))
    .sort();

  if (files.length === 0) {
    console.log("没有发现 test_report_*.json 文件");
    return;
  }

  const list: EvalReportInput[] = [];
  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(reportDir, file), "utf-8");
      list.push(JSON.parse(raw) as EvalReportInput);
      console.log(`读取: ${file}`);
    } catch (error) {
      console.error(`解析失败，跳过: ${file}`, (error as Error).message);
    }
  }

  if (list.length === 0) {
    console.log("没有可入库的报告");
    return;
  }

  const result = await evalService.createRunsBatch(list);
  console.log("\n===== 入库结果 =====");
  console.log(JSON.stringify(result.data, null, 2));

  const inserted = result.success ? result.data?.inserted ?? 0 : 0;
  if (deleteAfter && inserted > 0) {
    for (const file of files) {
      fs.unlinkSync(path.join(reportDir, file));
    }
    console.log(`\n已删除 ${files.length} 份原文件`);
  }

  await DatabaseFactory.close();
}

main().catch((error) => {
  console.error("脚本执行失败:", error);
  process.exit(1);
});
