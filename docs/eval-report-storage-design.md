# 评估集运行结果入库 — 方案文档

> 文档版本：v1.1
> 状态：方案待评审
> 所属工程：services/core（Trae Core Service）+ client（管理台）
> 关联文档：[评估集管理 — 方案文档](./eval-set-design.md)、[评估集管理 — 需求文档](./eval-set-requirements.md)

---

## 1. 背景与目标

### 1.1 现状问题

当前评估集运行结果的链路为"本地脚本跑测 → 写 JSON 文件 → 服务读文件展示"：

```
test_chat.py（本地试用脚本，维持现状不动）
   │  调 RAG API 逐条评测
   ▼
data/reports/test_report_{ts}.json   ← 结果只落盘为文件（开发机本地目录）
   │
   └──► core GET /core/stats/eval（src/modules/eval/service.ts 读文件聚合）──► RagDashboard
```

存在以下痛点：

1. **结果只存在于文件系统**：`data/reports` 是开发机本地目录，无法集中留存与查询；
2. **不可管理**：无法删除/归档某次运行、无法按评估集/时间/分类做 SQL 聚合分析；
3. **与评估集无关联**：报告 `results[].id`（T001…）与 `eval_cases.case_id` 天然对齐，但当前没有关联字段，无法按集追溯运行历史。

### 1.2 目标

- 评估集运行结果**入库保存**（MySQL，与 `eval_sets` / `eval_cases` 同库同连接），作为唯一数据源；
- 由**管理台**提供"导入评估结果"能力：把生成的 `test_report_*.json` 上传入库，看板展示改为查库（`GET /core/stats/eval` 响应结构保持不变）；
- **test_chat.py 保持现状**（本地试用工具，不改造、不为其提供接口）；
- 存量 12 份 JSON 报告入库核对后**直接删除，不保留**；
- **chartermate 为旧服务，由人工移除**，不在本方案实施范围内。

---

## 2. 总体方案

### 2.1 方案选型

| 决策点 | 推荐方案 | 理由 |
|---|---|---|
| 存储引擎 | MySQL（与评估集同库） | core 已是 MySQL 唯一数据源；单库单连接零新增依赖；天然支持 SQL 聚合 |
| 写入路径 | **管理台导入**：前端上传报告文件 → core 新接口 → 入库 | test_chat.py 不动；DB 访问集中在 core；前端是唯一写入方，天然可控 |
| 读取路径 | `GET /core/stats/eval` 改为查库 | 响应结构与现状完全一致，看板展示零改动 |
| 运行与评估集关联 | `eval_runs.set_id` 可空外键 + `set_name` 快照 | 兼容历史报告（无集信息）；运行是历史快照，不随评估集后续编辑变化 |
| 冗余快照 | `eval_runs` 保留 `raw_report` JSON 整份原始报告 | 完全复现 + 容错（字段演进不改表）；报告体积小（22 用例 ≈ 几十 KB），成本可忽略 |
| 存量文件 | 导入核对后直接删除 | 不保留、不归档（按用户要求） |

### 2.2 目标链路

```
test_chat.py（本地试用，产出 test_report_*.json）── 不改造
   │
   ▼ 手动/批量上传
管理台 RagDashboard「导入评估结果」──► POST /core/eval/runs（或 /batch）──► core 事务入库
   │
   ▼
MySQL：eval_runs + eval_run_cases（唯一数据源）
   │
   ▼
GET /core/stats/eval（查库聚合，响应不变）──► RagDashboard 展示
```

---

## 3. 数据模型

### 3.1 建表 DDL（MySQL 8.0+）

```sql
-- 评估运行头（一次评估集执行 = 一条记录；含汇总与整份快照）
CREATE TABLE IF NOT EXISTS eval_runs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    set_id INT NULL,                          -- 关联评估集；NULL=历史报告无集信息
    set_name VARCHAR(255) NULL,               -- 冗余快照，评估集改名后仍可追溯
    doc_scope VARCHAR(255) NULL,              -- 冗余快照
    status VARCHAR(20) NOT NULL DEFAULT 'completed',  -- completed=成功入库 / partial=明细写入中断（备用）
    timestamp VARCHAR(32) NULL,               -- 报告自带时间戳（YYYYMMDD_HHMMSS），兼容旧字段
    total INT NOT NULL DEFAULT 0,
    passed INT NOT NULL DEFAULT 0,
    avg_score DOUBLE NOT NULL DEFAULT 0,      -- 与 JS number 精度语义一致；原值在 raw_report 中无损保留
    avg_elapsed DOUBLE NOT NULL DEFAULT 0,
    pass_rate VARCHAR(20) NULL,
    category_stats JSON NULL,                 -- 分类统计快照（{分类:{count,avg_score}}）
    failed_cases JSON NULL,                   -- 失败用例摘要快照（[{id,question,score}]）
    raw_report JSON NULL,                     -- 整份原始报告快照（latest 直接反序列化，byte 级一致）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_run_set (set_id),
    INDEX idx_run_created (created_at),
    CONSTRAINT fk_run_set FOREIGN KEY (set_id) REFERENCES eval_sets(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 评估运行-用例明细（运行快照，不关联 eval_cases：用例后续编辑/软删不影响历史运行）
CREATE TABLE IF NOT EXISTS eval_run_cases (
    id INT PRIMARY KEY AUTO_INCREMENT,
    run_id INT NOT NULL,
    case_id VARCHAR(64) NOT NULL,             -- 与 eval_cases.case_id 对齐（T001…）
    question TEXT NOT NULL,
    score DOUBLE NULL,                        -- 异常用例可为 NULL
    elapsed DOUBLE NULL,
    keywords_found JSON NULL,                 -- 命中关键词数组
    keyword_count INT NOT NULL DEFAULT 0,
    source_count INT NOT NULL DEFAULT 0,
    has_answer TINYINT(1) NOT NULL DEFAULT 0,
    chapter_match TINYINT(1) NULL,            -- NULL=跨章节无预期（现报告即如此）
    answer_preview TEXT NULL,
    error TEXT NULL,                          -- 脚本异常时 results[] 中带 error 的用例
    UNIQUE KEY uk_run_case (run_id, case_id),
    FOREIGN KEY (run_id) REFERENCES eval_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.2 设计要点

- **运行即快照**：`eval_run_cases` 不设指向 `eval_cases` 的外键，评估集用例被编辑/软删后历史运行不受影响；`set_id` 外键用 `ON DELETE SET NULL`，软删评估集也不丢历史运行；
- **`raw_report` 冗余**：`latest` 直接 `JSON.parse(raw_report)` 返回，与今日读文件的结果 byte 级一致，看板展示无感知；`history` 用结构化列 SQL 聚合；
- **异常用例**：脚本 `except` 分支会产生 `{"id","question","score":0,"error":...}` 形态的条目，明细表以 `error` 列承接，其余字段取默认值；
- **JSON 列读取**：沿用 `eval-set/service.ts` 中 `parseKeywords` 的"字符串/已解析对象双形态兼容"写法（mysql2 对 JSON 列返回形态存在驱动差异），入库时 `JSON.stringify`；
- **精度**：score / elapsed 用 `DOUBLE` 与 JS number 语义一致；如需精确值以 `raw_report` 为准。

---

## 4. API 设计

统一响应走 `utils/response.ts` 的 `success / error`。写接口（导入/删除）使用现有 `requirePermission("eval:write")` 中间件——管理台 `coreRequest` 已自动附带 `x-user-id`，前端无需额外处理鉴权。

### 4.1 接口清单

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/core/eval/runs` | **新增**：导入单份评估报告入库（管理台上传单个文件） | eval:write |
| POST | `/core/eval/runs/batch` | **新增**：批量导入多份报告（管理台多选 / 存量回灌） | eval:write |
| GET | `/core/stats/eval` | **改实现**：查库聚合，响应结构不变（`{history, latest}`） | 开放（现状） |
| GET | `/core/eval/runs` | **新增**：运行历史分页列表（可选 `set_id` / `page` / `page_size`） | 开放 |
| GET | `/core/eval/runs/:id` | **新增**：单次运行详情（含用例明细） | 开放 |
| DELETE | `/core/eval/runs/:id` | **新增**：删除一次运行（级联删明细） | eval:write |

> 不为 test_chat.py 提供任何接口；脚本产出的文件由管理台导入。

### 4.2 导入单份（核心新增）

```jsonc
// POST /core/eval/runs
// body = test_report_*.json 的内容（前端 FileReader 读取后原样上传）+ 可选关联字段：
{
  "timestamp": "20260808_001021",
  "total": 22,
  "passed": 12,
  "avg_score": 0.7916666666666665,
  "avg_elapsed": 5.662055654959246,
  "set_id": 1,            // 可选：关联评估集
  "set_name": "员工手册-恒大",  // 可选：快照冗余（管理台可手动填）
  "summary": { "total_cases": 22, "passed_count": 12, "pass_rate": "54.5%",
               "avg_score": "79.2%", "avg_elapsed": "5.66s",
               "category_stats": { "概念查询": { "count": 2, "avg_score": 0.75 } },
               "failed_cases": [ { "id": "T014", "question": "…", "score": 0.0 } ] },
  "results": [ { "id": "T001", "question": "…", "score": 1.0, "elapsed": 5.1,
                 "keywords_found": ["…"], "keyword_count": 3, "source_count": 0,
                 "has_answer": true, "chapter_match": true, "answer_preview": "…" } ]
}

// 响应
{ "status": 200, "msg": "评估结果入库成功", "data": { "run_id": 13 } }
```

### 4.3 批量导入（存量回灌）

```jsonc
// POST /core/eval/runs/batch
// body = 报告对象数组（一次可传 12 份存量文件内容）
[ { /* 报告1，同 4.2 */ }, { /* 报告2 */ } ]

// 响应（逐份结果，语义对齐 eval-set 批量导入）
{ "status": 200, "msg": "批量导入完成",
  "data": { "total": 12, "inserted": 12, "skipped": 0,
            "failures": [ { "index": 3, "reason": "results 为空数组" } ] } }
```

校验规则（宽松兼容历史形态）：`results` 必须为非空数组；`total`/`passed`/`avg_score` 缺失时从 `results` 计算兜底；`timestamp` 缺失时以服务器时间生成 `YYYYMMDD_HHMMSS`；单份失败不影响其余份（batch 逐份独立事务）。

### 4.4 事务保证

单次运行 = run 头 + N 条明细，需**原子写入**，避免"半截运行"污染趋势：

- **推荐**：给 `IDatabaseAdapter` 增加 `withTransaction<T>(fn)`（`MySQLAdapter` 内 `getConnection` + `beginTransaction/commit/rollback`，~30 行）。这是通用能力，`eval-set` 批量导入后续亦可复用；
- **备选（零适配器改动）**：先插 run 头（`status='running'`）→ 逐条插明细 → 全部成功再 `UPDATE status='completed'`；中途失败留下 `status='partial'` 脏行，展示端过滤 `status <> 'partial'`，并在日志告警。

---

## 5. 模块实现清单

### 5.1 后端（services/core）

| 文件 | 内容 |
|---|---|
| `src/database/IDatabaseAdapter.ts` | （推荐项）追加 `withTransaction<T>(fn)` 接口 |
| `src/database/MySQLAdapter.ts` | （推荐项）实现事务方法 |
| `src/database/ensureSchema.ts` | 追加 `eval_runs` / `eval_run_cases` 幂等建表 |
| `database/init/init.sql` | 追加两张表（新库 docker-entrypoint 自动生效） |
| `src/modules/eval/types.ts` | 新增 `EvalRun` / `EvalRunCase` / `ImportEvalRunInput` / 批量导入结果类型 |
| `src/modules/eval/service.ts` | `getEvalStats()` 改为查库聚合（库空回退读文件）；新增 `createRun()`（事务入库）/ `createRunsBatch()` / `listRuns()` / `getRun()` / `deleteRun()` |
| `src/modules/eval/controller.ts` | 新增 `importRun` / `importRunsBatch` / `listRuns` / `getRun` / `deleteRun` 处理器 |
| `src/modules/eval/router.ts` | 新路由 + Swagger JSDoc（`/core/eval/runs`、`/core/eval/runs/batch`、`/core/stats/eval`） |

### 5.2 前端（client，管理台导入入口）

| 文件 | 内容 |
|---|---|
| `src/services/core/constants.ts` | `CORE_API.EVAL` 追加 `RUNS` / `RUNS_BATCH` / `RUNS_IMPORT` 路径 |
| `src/services/core/eval.ts` | 新增 `importEvalReport(body)` / `importEvalReportsBatch(list)` / `getEvalRuns()` / `getEvalRun(id)` / `deleteEvalRun(id)` |
| `src/services/core/types.ts` | 新增导入结果、运行列表/详情类型 |
| `src/pages/RagDashboard.tsx` | 新增「导入评估结果」入口：antd `Upload`（支持多选 `.json`，`FileReader` 读内容）→ 调导入接口 → 结果反馈（成功 run_id / 失败原因）→ 刷新看板 |

> test_chat.py、chartermate 均不修改（chartermate 由人工移除）。

---

## 6. 前端交互（导入评估结果）

1. 看板顶部新增「导入评估结果」按钮 → 弹窗 `Upload.Dragger`（accept=`.json`，可多选）；
2. 前端逐份 `FileReader.readAsText` 解析为对象（可选让用户补填 `set_name`，用于关联评估集快照）；
3. 单份 → `POST /core/eval/runs`；多份 → `POST /core/eval/runs/batch`；
4. 结果列表展示每份的入库状态（成功 `run_id` / 失败原因），成功后自动 `getEvalStats()` 刷新趋势与最新详情；
5. 存量 12 份文件：通过该入口批量导入，**核对看板数据后直接删除 `data/reports` 下的原文件**（不保留、不归档）。

---

## 7. 存量数据迁移

1. 存量 12 份 `data/reports/test_report_*.json` 通过管理台「批量导入」一次入库（走 `POST /core/eval/runs/batch`）；
2. 迁移完成后核对：`SELECT COUNT(*) FROM eval_runs` == 12；`GET /core/stats/eval` 返回的 history/latest 与迁移前读文件结果一致（逐项比对 avg_score/passed/category_stats）；
3. 核对无误后**直接删除** `data/reports` 下的原文件（无需归档保留）；`eval` 服务同时移除"库空回退读文件"逻辑，读源收敛为 DB 单源。

---

## 8. 前端影响

- **展示部分零改动**：`GET /core/stats/eval` 响应结构（`{history: EvalHistoryItem[], latest: EvalReport|null}`）完全不变，RagDashboard 现有渲染不动；
- **新增导入功能**：RagDashboard 增加导入入口（见 §5.2 / §6），这是本期唯一前端改动；
- 可选后续增强（不在本期）：基于 `GET /core/eval/runs` 增加"运行历史管理"页面（列表/详情/删除）、按评估集筛选趋势。

---

## 9. 决策点（已定）

| 编号 | 决策点 | 结论 | 说明 |
|---|---|---|---|
| P1 | 导入接口权限 | **`eval:write`**（复用现有权限与中间件） | 管理台 `coreRequest` 自动带 `x-user-id`；读接口开放与现状一致 |
| P2 | 事务实现 | **适配层加 `withTransaction`**（推荐）/ 状态机备选 | 见 §4.4 |
| P3 | `total` 与 `results.length` 不一致 | **以 results 实际为准，宽松入库** | 兼容历史脚本统计口径差异 |
| P4 | 存量文件处理 | **入库核对后直接删除** | 不保留、不归档 |
| P5 | test_chat.py / chartermate | **均不改造**；chartermate 人工移除 | 脚本保持本地试用工具现状 |

---

## 10. 风险与注意事项

| 风险 | 说明 | 应对 |
|---|---|---|
| 迁移期间双读源 | 存量文件未入库时看板为空 | `getEvalStats`"先查库、库空回退读文件"，存量导入完成即移除回退 |
| 半截运行污染趋势 | 明细写入中断 | 事务原子写入（或 partial 状态过滤） |
| 重复导入产生重复记录 | 同一文件多次上传 | 运行天然多版本，允许重复；管理台导入后给出成功反馈，用户可删除误导入的运行 |
| JSON 列形态差异 | mysql2 对 JSON 列返回字符串/对象不一 | 沿用 `parseKeywords` 双形态兼容写法 |
| 前端解析失败 | 文件格式不符/编码问题 | 导入前本地 JSON.parse 校验，逐份反馈失败原因，不阻断其余文件 |
| 大 `raw_report` | 用例数多时 JSON 列膨胀 | 单集数百条用例约几百 KB，可接受；明细已结构化，raw_report 仅作快照 |
| 旧库无新表 | 已有数据卷不重跑 init.sql | 启动时 `ensureSchema()` 幂等建表（与现有机制一致） |

---

## 11. 分阶段实施计划

**阶段一：core 侧入库（核心）**
1. `ensureSchema.ts` / `init.sql` 追加两张表；
2. 适配层加 `withTransaction`；
3. `eval` 模块：导入接口（单份 + 批量，`eval:write`）+ 运行历史 CRUD + `getEvalStats` 改查库（含空库回退）。

**阶段二：管理台导入 + 存量迁移**
4. 前端导入入口（Upload + 结果反馈 + 刷新）；
5. 通过管理台批量导入存量 12 份报告并核对；
6. 移除文件回退逻辑，**删除** `data/reports` 原文件。

**阶段三（可选）**
7. 前端运行历史管理页；按评估集筛选趋势。

**验证**：`npm run build`（core + client）；冒烟 = 管理台上传一份测试报告 → `/core/stats/eval` 出现新 history/latest 且与旧文件读数一致 → 批量导入 12 份存量逐项比对 → 异常用例（error 形态）入库 → 事务回滚用例 → 无权限用户导入被 403 拒绝。

---

## 12. 变更记录

| 版本 | 日期 | 变更内容 |
|---|---|---|
| v1.4 | - | 接口命名规范：在线运行评估集由 `POST /core/eval/runs/run`（body 传 set_id）迁移为 **`POST /core/eval/sets/:id/runs`**（set_id 入路径，与 `sets/:id/cases` 子资源风格一致）；评估集在线运行改为有界并发（`EVAL_CONCURRENCY`，默认 4）逐条调 docs-seeker /v1/chat |
| v1.3 | - | 新增**在线运行评估集**：POST /core/eval/runs/run（set_id，eval:write）——core 取集内 normal 用例逐条调 docs-seeker /v1/chat 评测（移植 test_chat.py 评分口径），汇总后经 createRun 入库；评估历史页增加「运行评估集」入口（选择评估集 → 运行 → 结果摘要 + 列表刷新）；运行历史菜单图标改为 HistoryOutlined |
| v1.2 | - | 实施完成：建表（eval_runs/eval_run_cases）+ withTransaction + 导入/批量/历史 CRUD 接口落地；/core/stats/eval 改查库并移除文件回退；管理台拆分为 RAG 看板（含导入入口）/ 运行历史两页（系统状态内容合并进仪表盘 RAG 使用统计卡，页面下线）；存量 12 份报告已入库（12 运行 / 264 明细）并删除原文件 |
| v1.1 | - | 按评审调整：写入路径改为**管理台导入**（不改造 test_chat.py、不为其提供接口）；存量文件导入核对后直接删除不保留；chartermate 由人工移除，不在实施范围 |
| v1.0 | - | 初稿：两表入库方案（eval_runs + eval_run_cases）、报告回流 API、存量迁移、双读源收敛 |
