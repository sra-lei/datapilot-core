# 评估集管理功能 — 方案文档

> 文档版本：v1.2
> 状态：已确认（决策点已定稿，见 §8）
> 所属工程：services/core（Trae Core Service）
> 关联文档：[评估集管理 — 需求文档](./eval-set-requirements.md)

---

## 1. 总体设计

### 1.1 设计思路

core 作为评估集的**唯一数据源**：评估集与用例以结构化数据存于 MySQL，通过 REST API 提供管理能力；导出接口输出与现有评测脚本完全兼容的 JSON，支撑"core 管集、脚本跑测、报告回流看板"的闭环。

```
业务方/前端 ──► GET/POST /core/eval/* ──► core eval-set 模块 ──► MySQL (eval_sets / eval_cases)
                                                                      │
评测脚本 test_chat.py ◄── GET /core/eval/sets/:id/export（示例格式 JSON）
评估看板 RagDashboard ◄── GET /core/stats/eval（现有 eval 模块，不动）
```

### 1.2 模块划分

新增独立模块 `src/modules/eval-set/`，**不修改**现有 `src/modules/eval/`（评估报告读取）：

| 模块 | 职责 | 挂载路径 |
|---|---|---|
| `eval`（现有） | 读取 `data/reports/test_report_*.json`，提供评估报告历史趋势 | `/core/stats/eval` |
| `eval-set`（新增） | 评估集与用例 CRUD、批量导入、导出、一步导入 | `/core/eval/*` |

沿用 core 既有分层：`types.ts` / `service.ts` / `controller.ts` / `router.ts`。

---

## 2. 数据模型

### 2.1 建表 DDL（MySQL 8.0+）

```sql
-- 评估集
CREATE TABLE IF NOT EXISTS eval_sets (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    doc_scope VARCHAR(255),
    status VARCHAR(20) DEFAULT 'normal',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 评估用例
CREATE TABLE IF NOT EXISTS eval_cases (
    id INT PRIMARY KEY AUTO_INCREMENT,
    set_id INT NOT NULL,
    case_id VARCHAR(64) NOT NULL,
    question TEXT NOT NULL,
    expected_chapter VARCHAR(255) NULL,
    expected_keywords JSON NOT NULL,
    category VARCHAR(50) NOT NULL,
    sort_order INT DEFAULT 0,
    status VARCHAR(20) DEFAULT 'normal',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_set_case (set_id, case_id),
    FOREIGN KEY (set_id) REFERENCES eval_sets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

要点：

- `expected_chapter` 允许 NULL，语义为"跨章节"（对应示例数据中的 `None`）；
- `expected_keywords` 用 MySQL `JSON` 类型，入库时 `JSON.stringify`；
- `(set_id, case_id)` 唯一键保证集内编号唯一，批量导入天然去重；
- 软删除：评估集与用例的 `status` 仅取 `normal`（正常）/ `disabled`（禁用）/ `deleted`（已删除）；删除接口只改状态（置为 deleted），不物理删除；`(set_id, case_id)` 唯一键对已删行同样生效，重导同编号时走"恢复"逻辑而非插入。

### 2.2 分类与状态枚举

`category` 白名单常量（放 `eval-set/constants.ts`，可扩展）：

```
事实查询 | 概念查询 | 理解推理 | 综合概括
```

`status` 状态常量（三态）：

```
normal（正常，默认，可正常使用） | disabled（禁用，跑评估集时跳过） | deleted（已删除，软删除）
```

- 更新接口（PUT 集/用例）仅允许在 `normal` / `disabled` 间切换；`deleted` 只能通过删除接口置为软删除；
- 管理视图（列表 / 详情）展示 normal 与 disabled，过滤 deleted；
- **导出（评测口径）只含 normal 用例**：禁用与已删除均不参与评估。

---

## 3. API 设计

统一响应走 `utils/response.ts` 的 `success / error`（`{status, msg, data}`），中文强制 utf8mb4。

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| GET | `/core/eval/sets` | 评估集列表（含用例数、分类分布；不含已删除） | 开放 |
| POST | `/core/eval/sets` | 创建评估集（默认正常） | eval:write |
| GET | `/core/eval/sets/:id` | 评估集详情（含正常与禁用用例，不含已删除） | 开放 |
| PUT | `/core/eval/sets/:id` | 更新评估集元信息（含状态切换 normal↔disabled；改回 normal 可恢复被软删的集） | eval:write |
| DELETE | `/core/eval/sets/:id` | 软删除评估集（状态改 deleted，级联软删除其下用例） | eval:write |
| POST | `/core/eval/sets/:id/cases` | 批量导入用例（重复且未删除→跳过；重复且已删除→恢复为正常） | eval:write |
| PUT | `/core/eval/cases/:id` | 更新单条用例（含状态切换 normal↔disabled） | eval:write |
| DELETE | `/core/eval/cases/:id` | 软删除单条用例（状态改 deleted） | eval:write |
| GET | `/core/eval/sets/:id/export` | 导出示例格式 JSON 数组（只含正常用例） | 开放 |
| POST | `/core/eval/sets/import` | 一步建集 + 导入用例 | eval:write |

### 3.1 请求 / 响应示例

**创建评估集**

```jsonc
// POST /core/eval/sets
{ "name": "员工手册-恒大", "description": "员工手册问答回归集", "doc_scope": "员工手册" }
```

**批量导入用例**（body 直接兼容示例数据格式）

```jsonc
// POST /core/eval/sets/1/cases
[
  { "id": "T001", "question": "恒大地产集团是什么时候在香港上市的？",
    "expected_chapter": "第一章", "expected_keywords": ["2009年11月5日", "3333", "联交所"],
    "category": "事实查询" },
  { "id": "T021", "question": "公司对员工有哪些要求？",
    "expected_chapter": null, "expected_keywords": ["行为规范", "修身准则", "规章制度"],
    "category": "综合概括" }
]

// 响应
{ "status": 200, "msg": "导入成功", "data": { "total": 2, "inserted": 2, "skipped": 0, "restored": 0, "failures": [] } }
```

**导出评估集**

```jsonc
// GET /core/eval/sets/1/export
// data 为示例格式 JSON 数组：
[
  { "id": "T001", "question": "…", "expected_chapter": "第一章", "expected_keywords": ["…"], "category": "事实查询" },
  { "id": "T021", "question": "…", "expected_chapter": null, "expected_keywords": ["…"], "category": "综合概括" }
]
```

**一步导入**

```jsonc
// POST /core/eval/sets/import
{
  "name": "员工手册-恒大",
  "description": "从示例数据一步建集",
  "cases": [ /* 示例格式数组 */ ]
}
```

### 3.2 校验规则

| 字段 | 规则 |
|---|---|
| `id` | 必填；匹配 `^[A-Za-z0-9_-]{1,64}$`；集内唯一（违反 → 计入 skipped） |
| `question` | 必填非空（违反 → 计入 failures） |
| `expected_keywords` | 必填、数组、非空、元素为字符串 |
| `expected_chapter` | 字符串或 null |
| `category` | 白名单枚举，未知值 → 计入 failures |
| `name` | 必填、唯一（重复 → 409） |
| `status`（集/用例） | `normal` / `disabled` / `deleted`；创建与导入默认 `normal`；删除接口只允许置为 `deleted`，更新接口仅支持 normal/disabled 切换 |

批量导入**逐条处理**：单条失败计入 `failures` 明细（含索引与原因），不阻断其余用例，符合需求 N5。
软删除语义：列表 / 详情 / 统计（用例数、分类分布）过滤 `status='deleted'`，保留 normal 与 disabled；删除评估集时级联将其下用例一并置为已删除；重新导入与已删除用例同编号的数据时自动恢复为正常（`restored` 计数）；**导出只含 `normal` 用例（评测口径，禁用即跳过）**。

---

## 4. 存储与初始化策略

1. **`database/init/init.sql` 追加**：两张表 `CREATE TABLE IF NOT EXISTS`（含 `status` 列）+ 权限种子（新库在 `docker-entrypoint-initdb.d` 自动生效）；
2. **启动时 `ensureSchema()`**：在 `index.ts` 数据库初始化后执行幂等建表（`CREATE TABLE IF NOT EXISTS` + `INSERT IGNORE` 权限种子）。原因：已有数据库卷不会重跑 init.sql，启动建表可保证本地/既有环境零手工步骤、重复执行安全（推荐采用，成本极低）；
3. **旧表补列**：早期版本 `eval_cases` 无 `status` 列，`ensureSchema()` 通过 `information_schema.columns` 判断后 `ALTER TABLE ADD COLUMN` 补齐（MySQL 不支持 `ADD COLUMN IF NOT EXISTS`）；
4. 编码安全由现有 MySQLAdapter（utf8mb4）保证，无需额外处理。

---

## 5. 模块实现清单

| 文件 | 内容 |
|---|---|
| `src/modules/eval-set/types.ts` | `EvalSet` / `EvalCase` / 批量导入结果 / `ServiceResult` |
| `src/modules/eval-set/constants.ts` | 分类枚举、状态枚举、消息常量 |
| `src/modules/eval-set/service.ts` | CRUD + 批量导入 + 导出 + 一步导入（DatabaseFactory 取连接） |
| `src/modules/eval-set/controller.ts` | 参数校验、调用 service、`success/error` 响应 |
| `src/modules/eval-set/router.ts` | 路由注册 + Swagger JSDoc |
| `src/app.ts` | 挂载 `app.use("/core/eval", evalSetRouter)` |
| `src/database/ensureSchema.ts` | 启动时幂等建表 + 权限种子 |
| `database/init/init.sql` | 追加建表 + `eval:read` / `eval:write` 权限种子 |
| `src/index.ts` | 启动时调用 `ensureSchema()` |

---

## 6. 与现有链路的关系

- `GET /core/stats/eval`、`src/modules/eval/`、`data/reports/` 全部**保持不变**；
- `upload_dataset.py` 中的 `CATEGORY_TO_QUERY_TYPE` 映射（事实查询→fact 等）与 core 的分类枚举一致，后续 Python 侧改造可直接复用导出数据；
- 报告 `results[].id`（T001…）与评估集 `case_id` 天然对齐，后续"报告-评估集"关联分析具备基础。

---

## 7. 权限设计（推荐项）

- `init.sql` 增加权限种子：`('eval:read','查看评估集')`、`('eval:write','管理评估集')`；
- admin 角色按现有逻辑自动获得全部权限（`INSERT IGNORE INTO role_permissions … WHERE r.name='admin'`），无需额外配置；
- 写接口使用现有 `requirePermission("eval:write")` 中间件（依赖 `x-user-id` 请求头，与用户/权限模块一致）；读接口开放，与 `stats/eval` 现状一致。

> 开放决策点：若希望完全开放（与现有 stats 一致、零权限配置），可去掉写接口的权限中间件，仅删减两处代码，风险极小。

---

## 8. 决策结论（已确认）

| 决策点 | 结论 | 说明 |
|---|---|---|
| 数据模型 | ✅ 两表多评估集 | `eval_sets` + `eval_cases`，支持多文档多集并存 |
| 集成范围（本期） | ✅ 仅 core CRUD + 导出 | Python 侧（test_chat.py / upload_dataset.py）改造列入下一期 |
| 写接口权限 | ✅ 加 `eval:write` | 增删改/导入接口 `requirePermission("eval:write")`，读接口开放 |
| 表初始化 | ✅ init.sql + 启动 ensureSchema 双保险 | 启动时幂等建表，已有库零手工步骤 |
| 状态与软删除 | ✅ 三态定稿 | `normal`（正常，默认，可正常使用）/ `disabled`（禁用，跑评估集时跳过该条）/ `deleted`（已删除，软删除）；删除接口只改状态，更新接口仅支持 normal/disabled 切换，导出只含正常用例 |

---

## 9. 风险与注意事项

| 风险 | 说明 | 应对 |
|---|---|---|
| 已有库不执行 init.sql | docker-entrypoint 仅新卷生效 | 启动时 ensureSchema 幂等建表 |
| 旧表缺 status 列 | 早期版本 eval_cases 无状态列 | ensureColumn 按元数据判断补列 |
| 旧数据状态迁移 | 早期两态版本存有 active 值 | ensureSchema 启动时统一 UPDATE active→normal |
| 禁用语义 | 禁用 = 评测时跳过，管理视图仍可见 | 导出只含 normal；列表/详情保留 disabled 展示 |
| 重复导入产生脏数据 | 用例 id 重复 | `(set_id, case_id)` 唯一键 + 导入计数；已删除行重导自动恢复 |
| 软删数据恢复 | 删除集后其下用例已软删，恢复集时用例保持已删除 | 明确语义：恢复集 ≠ 恢复用例，用例需重新导入 |
| 跨章节 null 处理 | 前端/脚本需区分 null 与空串 | 导出严格输出 null；文档明示语义 |
| 权限误配 | admin 外角色无写权限导致无法维护 | 管理员可通过权限管理接口为角色分配 `eval:write` |
| 中文乱码 | 关键词含中文 | 已有 utf8mb4 适配层兜底 |

---

## 10. 工作量与交付

- 新增/修改文件：10 个（5 个新文件 + 5 个修改），估算 1–2 人日；
- 交付物：后端模块 + 建表/补列脚本 + 权限种子 + 需求/方案文档；
- 验证：`npm run build` + 冒烟测试（建集 → 导入示例 22 条 → 查询 → 导出比对 → 软删/恢复 → 权限 403 验证）。

---

## 11. 变更记录

| 版本 | 日期 | 变更内容 |
|---|---|---|
| v1.2 | - | 状态模型定稿为三态（normal/disabled/deleted）：更新接口仅支持 normal↔disabled，导出只含 normal（禁用即评测跳过）；ensureSchema 增加 active→normal 数据迁移 |
| v1.1 | - | 状态与软删除：评估集与用例增加 `status`，删除改为软删除（只改状态）；列表/详情/导出/统计过滤已删除；导入自动恢复已删用例；ensureSchema 增加旧表补列 |
