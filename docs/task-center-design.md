# 任务机制与任务中心 — 方案文档

> 文档版本：v1.0
> 状态：方案待评审
> 所属工程：services/core（任务引擎）+ services/doc-kit（生成任务）+ client（任务中心）
> 关联文档：[评估集管理 — 方案文档](./eval-set-design.md)、[评估运行结果入库 — 方案文档](./eval-report-storage-design.md)、[上传文档生成评估集 — 方案文档](./eval-generate-design.md)

---

## 1. 背景与问题

### 1.1 现状

| 长耗时操作 | 接口 | 现状 |
|---|---|---|
| 从文档生成评估集 | `POST /core/eval/sets/generate` | 同步：core → doc-kit LLM 生成（10~60s+）→ 建集入库，期间前端 10 分钟超时干等 |
| 运行评估集 | `POST /core/eval/runs/run` | 同步：core 逐用例调 docs-seeker（22 用例约 2 分钟，大集更久），期间无任何中间反馈 |

### 1.2 问题

1. **请求断连即丢任务**：同步 HTTP 在生成/运行中途超时或连接断开，结果丢失（runSet 只在全部完成时才写 eval_runs）；
2. **无进度可见性**：前端只有"正在生成/评估中…"的笼统提示，无法知道进行到哪一步；
3. **无法并发与取消**：不能同时跑多个、不能中途取消；
4. **无任务审计**：谁在什么时候发起了什么任务、成败如何，没有记录。

---

## 2. 总体设计

### 2.1 任务模型（core MySQL 新表）

```sql
CREATE TABLE IF NOT EXISTS tasks (
    id INT PRIMARY KEY AUTO_INCREMENT,
    task_type VARCHAR(50) NOT NULL,          -- eval_set_generate / eval_run
    status VARCHAR(20) NOT NULL DEFAULT 'queued',  -- queued/running/success/failed/cancelled
    payload JSON NULL,                        -- 入参快照（doc_id/set_id/count 等）
    progress INT NOT NULL DEFAULT 0,          -- 0-100
    progress_detail JSON NULL,                -- 阶段/当前步骤明细（见 §4）
    result JSON NULL,                         -- 成功结果（set_id / run_id / 摘要）
    error TEXT NULL,                          -- 失败原因
    created_by INT NULL,                      -- 触发用户 id（x-user-id）
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    INDEX idx_tasks_type (task_type),
    INDEX idx_tasks_status (status),
    INDEX idx_tasks_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

- **任务 = 执行过程**，**结果**：`eval_run` 的成果落在 `eval_runs`（任务 result 存 run_id 关联）；`eval_set_generate` 的成果落在 `eval_sets`（result 存 set_id 关联）；
- 幂等/去重：同一入参短时间内重复提交按需合并（决策点 P4）；
- 保留策略：任务记录保留 N 天，成功后清理 detail/result 以外的体积字段（决策点 P6）。

### 2.2 执行链路

```
┌─ 前端任务中心 / 评估集·评估历史页 ─────────────────────────┐
│ POST /core/tasks/eval-run {set_id}        → {task_id}       │
│ POST /core/tasks/eval-set-generate {...}  → {task_id}       │
│ GET  /core/tasks/:id（轮询 2-3s）→ status/progress/detail    │
└───────────────────────────────────────────────────────────┘
        │ 提交
        ▼
core 任务引擎（进程内 worker，串行/受限并发）
  ├─ eval_run：逐用例调 docs-seeker /v1/chat
  │    每完成一个用例 → 更新 progress = i/N + 当前用例得分
  │    全部完成 → createRun 入库 → result = {run_id, ...}
  ├─ eval_set_generate：调 doc-kit 异步生成任务
  │    轮询 doc-kit 任务进度（逐章节/批次）→ 镜像到 core 任务
  │    完成后 → 编号校验 → importSet → result = {set_id, ...}
```

### 2.3 doc-kit 生成任务化（进度源）

doc-kit 复用现有 `TaskManager`（SQLite 持久化）把 `eval/generate` 异步化：

```
POST /doc-kit/api/v1/eval/generate/task  {task_id, count} → {task_id, status}
GET  /doc-kit/api/v1/eval/generate/task/{task_id}         → {status, progress, progress_detail, result}
```

- 生成器按"整篇一次 / 按章节分批"策略执行，**每完成一个批次更新一次 progress**（进度粒度：章节/批次）；
- 原同步 `POST /doc-kit/api/v1/eval/generate` 保留（供单测/直接调试），core 生产路径走异步任务。

---

## 3. API 设计（core）

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/core/tasks/eval-set-generate` | body: {doc_id, set_name?, count?} → {task_id} | eval:write |
| POST | `/core/tasks/eval-run` | body: {set_id} → {task_id} | eval:write |
| GET | `/core/tasks` | 任务列表（type/status 过滤 + 分页） | 开放（见 P5） |
| GET | `/core/tasks/:id` | 任务详情（status/progress/progress_detail/result/error） | 开放（见 P5） |
| POST | `/core/tasks/:id/cancel` | 取消运行中任务 | eval:write |

> 改造影响：现有 `POST /core/eval/sets/generate` 与 `POST /core/eval/runs/run` **由同步改为"提交任务"语义**（返回 task_id），前端改为提交后轮询/跳转任务中心。

---

## 4. 进度设计

| 任务类型 | 进度粒度 | progress_detail 示例 |
|---|---|---|
| eval_run | 逐用例 | `{ "phase": "running", "done": 8, "total": 22, "current": { "case_id": "T009", "score": 0.7 }, "passed": 6 }` |
| eval_set_generate | 阶段 + 章节/批次 | `{ "phase": "generating", "phase_progress": "3/8 批次", "filename": "员工手册.pdf" }` 阶段：parsing → generating → importing |

- `progress` = 0-100 整数（run：`done/total*100`；generate：阶段权重 × 批次进度）；
- 前端进度条 + detail 文案（如"正在评估 T009，当前得分 70%…" / "LLM 生成中：第 3/8 批…"）。

---

## 5. 前端任务中心

### 5.1 页面（新路由 `/tasks`，菜单「任务中心」）

```
┌ 任务中心                [刷新] ┐
│ 筛选：类型 / 状态                 │
│ ┌ 任务列表 ─────────────────┐   │
│ │ 类型 | 状态Tag | 进度条 | 发起人 | 开始时间 | 耗时 | 操作 │
│ │ eval_run | ▓▓▓ 45% | admin | 08-28 01:50 | 1m20s | 详情/取消 │
│ └──────────────────────────┘   │
│ 详情抽屉：入参 / progress_detail / 结果（跳转评估集或运行） / 错误 │
└────────────────────────────────┘
```

- 列表 3 秒轮询一次（仅当存在 running 任务时高频）；
- 详情抽屉：展示 payload、进度明细（当前用例/得分或批次进度）、成功结果（链接到 `/eval-sets/:id` 或 `/eval-runs` 详情）、失败原因、取消按钮；
- 取消确认 Popconfirm。

### 5.2 现有调用点改造

- **评估集管理「从文档生成」Tab**：点击生成 → 提交任务 → 弹窗/跳转任务中心展示进度 → 成功后提供"查看用例"；
- **评估历史「运行评估集」弹窗**：提交任务 → 展示任务进度（可内联轮询）→ 完成后刷新历史列表并可跳转运行详情；
- 两个入口均保留"前往任务中心"的快捷链接。

---

## 6. 决策点（待确认）

| 编号 | 决策点 | 推荐 | 说明 |
|---|---|---|---|
| P1 | 任务引擎位置 | core 进程内 worker | 单实例即可；后续可拆独立 worker 进程/队列 |
| P2 | 执行模型 | 串行队列 + `EVAL_CONCURRENCY` 并发上限 | 已有 env 变量；默认串行，可开并发（写 eval_runs 用 withTransaction 无冲突） |
| P3 | 同步接口改造 | **改为提交任务语义**（返回 task_id） | 破坏性改动，前端两处调用点同步改造；旧的同步行为不再保留 |
| P4 | 重复提交 | 不合并（每提交一次=一个任务）；前端按钮 loading 防连点 | 简单可控；重复任务结果重复但可删（任务与运行均可删） |
| P5 | 任务可见性 | 触发人可见全部；admin 可见全部；其余用户不可见 | `created_by` 过滤 + admin 通配 |
| P6 | 任务保留 | 成功保留 7 天、失败保留 30 天（定时清理） | 结果已在 eval_runs/eval_sets，任务记录只是过程审计 |
| P7 | 取消 | 本期支持 eval_run 取消（worker 检查标志位，已完成用例不丢） | eval_set_generate 取消=丢弃 doc-kit 生成任务结果 |
| P8 | 失败重试 | 不自动重试；任务中心提供"重试"按钮（同入参重新提交） | 简单 |

---

## 7. 风险与注意事项

| 风险 | 说明 | 应对 |
|---|---|---|
| 进程重启丢内存任务 | worker 状态在内存 | 任务表记录 queued/running，启动时把 running 重置为 failed（"进程重启中断"），提供重试 |
| 轮询压力 | 多客户端高频轮询 | 列表轮询 3s；仅运行中任务多时前端才高频；接口轻量（单行查询） |
| doc-kit 任务与 core 任务状态漂移 | 生成任务跨服务 | core 轮询 doc-kit 任务并镜像；doc-kit 任务超时/失败时 core 任务置 failed 并带原因 |
| 结果一致性 | 任务 success 但 eval_runs 写入失败 | 任务 result 只在 createRun/importSet 成功后写入；失败则任务 failed，无脏结果 |
| 取消竞态 | 取消与完成同时发生 | worker 在每用例边界检查标志位；取消后不再写结果；状态以最终写库为准 |

---

## 8. 工作量与交付

- 后端：core 任务表 + 任务服务/worker + 3 个接口 + 取消/清理；doc-kit 生成任务异步化 + 状态接口（2~3 人日）；
- 前端：任务中心页 + 路由/菜单 + 两处调用点改造（1~1.5 人日）；
- 验证：提交生成任务 → 任务中心看进度（批次推进）→ 成功跳转评估集；提交运行任务 → 逐用例进度 → 完成刷新评估历史；进程重启恢复语义；取消与权限。

---

## 9. 变更记录

| 版本 | 日期 | 变更内容 |
|---|---|---|
| v1.1 | 2026-08-28 | 已实施：core 新增 tasks 表 + 任务服务/worker（进程内串行队列 + EVAL_CONCURRENCY）+ `/core/tasks/*` 5 个接口；doc-kit 新增异步生成接口 `POST/GET /api/v1/eval/generate/task`（复用 TaskManager，进度按章节/批次）；前端新增 `/tasks` 任务中心页（3s 轮询、详情抽屉、取消确认），评估集「从文档生成」与评估历史「运行评估集」两处调用点改为提交任务 + 轮询进度；旧同步接口 `POST /core/eval/sets/generate`、`POST /core/eval/sets/:id/runs` 按 P3 改为提交任务语义（返回 task_id）。决策点落地：P1 进程内 worker、P2 串行队列、P4 不合并重复提交、P5 created_by 过滤 + admin 通配、P6 成功 7 天/失败 30 天定时清理、P7 eval_run 逐用例边界取消检查（取消后不写结果）、P8 提供重试（重新提交同入参）；启动时把 queued/running 置为 failed（进程重启中断）。 |
| v1.0 | - | 初稿：任务表 + core 任务引擎 + doc-kit 生成任务化 + 前端任务中心 |
