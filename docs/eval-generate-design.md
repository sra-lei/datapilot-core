# 上传文档生成评估集 — 方案文档

> 文档版本：v1.4
> 状态：方案待评审（P2/权限/入口/文档来源/生成策略已定稿，见 §8/§9）
> 所属工程：services/core（编排）+ services/doc-kit（解析/生成）+ client（管理台入口）
> 关联文档：[评估集管理 — 方案文档](./eval-set-design.md)、[评估运行结果入库 — 方案文档](./eval-report-storage-design.md)

---

## 1. 背景与目标

### 1.1 现状

评估集目前只能手工导入（`POST /core/eval/sets/import`），用例需要人工编写，数据量少、成本高：

- 22 条存量用例（ALL22）全为手工整理；
- 没有从文档自动构造用例的能力，评估覆盖度依赖人工投入。

### 1.2 目标

**上传一份文档 → 自动生成一个评估集**（question / expected_keywords / expected_chapter / category），用户确认后可立即「运行评估集」评测 RAG 对该文档的问答质量。

---

## 2. 关键能力盘点（已确认）

| 能力 | 所在服务 | 现状 |
|---|---|---|
| 文件解析（章节/节/条款元数据） | doc-kit | `FitzParser.extract` → paragraphs（含 chapter/section/article/page） |
| 分块 + 按章节分组 | doc-kit | `chunk_documents` + `Summarizer.group_by_chapter(chunks)` |
| LLM 调用（DeepSeek） | doc-kit | `LLMClient`（openai SDK，摘要已在用） |
| LLM 网关（熔断/降级/追踪） | docs-seeker | `LLMGateway`（chat 用） |
| 评估集/用例落库与校验 | core | `eval_sets` / `eval_cases` + `POST /core/eval/sets/import` |

**结论**：doc-kit 同时具备「解析出章节结构」和「调 LLM」两项能力，是生成用例的自然位置；core 只负责编排与落库，不新增 LLM 依赖。

---

## 3. 总体方案

### 3.1 数据流

```
┌─ 入库人员（doc:ingest）────────────────────────────┐
│ 文档入库（现有 /doc-ingest）→ doc-kit ingest          │
│   ├─ 解析出 paragraphs（含 chapter/section/article）  │
│   ├─ ① 保存 paragraphs → data/documents/{task_id}.json  ← 生成评估集的权威内容源
│   ├─ ② chunks 写入 Milvus（RAG 检索用，与生成无关）     │
│   └─ task 记录持久化（SQLite TASK_DB_PATH）            │
└───────────────────────────────────────────────────┘
                    │ 文档库（task 记录 + 段落文件）
                    ▼
┌─ 评估人员（eval:write）────────────────────────────┐
│ 评估集管理页「新建评估集」→「从文档生成」Tab           │
│   → 选取已入库文档（GET doc-kit /api/v1/documents）   │
│   → POST /core/eval/sets/generate {doc_id}          │
│   → doc-kit 读取保存的 paragraphs（原始文档结构）      │
│     → 按章节分组（不经 chunk 算法）→ 逐章 LLM 生成 QA  │
│   → core 校验 → createSet + addCases 落库            │
│   → 文档已在 RAG，生成完即可「运行评估集」            │
└───────────────────────────────────────────────────┘
```

> **不依赖 Milvus、不经过 chunk 算法（关键设计约束）**：
> 若从 Milvus chunk 生成用例，等于"用切块算法的产物出题、再让同一套切块去检索回答"——自证式评估：
> 期望关键词天然取自 chunk 文本、问题天然落在 chunk 边界内，检索命中率虚高，测不出真实问答能力。
> 因此生成源固定为**解析器输出的原始段落**（保留文档原生章节结构），chunk 切分与向量检索仅服务于 RAG 运行，与用例生成完全解耦。

### 3.2 生成位置选型（决策点 P1，推荐方案 1）

| 方案 | 说明 | 优点 | 缺点 |
|---|---|---|---|
| **1. doc-kit 生成（推荐）** | doc-kit 新增 eval-generate 模块：parse → chunk → 分组 → 逐章 LLM 生成 | 解析+LLM 都在一个服务内，复用 `group_by_chapter` 与 `LLMClient`；core 零 LLM 依赖 | doc-kit 需暴露生成接口（领域逻辑仍在 core 落库） |
| 2. docs-seeker 生成 | 文档 ingest 后 docs-seeker 从 Milvus 拉 chunk 再 LLM 生成 | 复用 LLM 网关（熔断/Langfuse） | 需新增 Milvus 按 task_id 拉 chunk 文本接口；依赖入库状态；链路更长 |
| 3. core 直连 LLM | core 新增 DeepSeek 客户端 | 编排全在 core | LLM 配置/熔断/追踪重复实现，与现有网关割裂 |

> **P2 已定稿（接口解耦）**：生成评估集与文档入库在接口层面完全分开——生成只做"解析文本 + LLM 生成用例"，不触发入库（Milvus）。生产场景下两拨人分工，见 §8 权限设计。

---

## 4. 用例生成设计（doc-kit）

### 4.1 生成策略（整篇一次生成，大文档按章节分批兜底）

```
POST /api/v1/eval/generate  body: { task_id, count?=15 }
  → 读取 data/documents/{task_id}.json（入库时保存的 FitzParser 段落）
  → 按章节组织成"带章节标题的全文"（保留真实章节/节/条款标题层级）
  → 若全文长度 ≤ WHOLE_DOC_LIMIT（默认 60K 字符，可配）：
      LLM 一次调用 → 生成 count 条 QA（要求覆盖各章节、分类均衡、含跨章节题）
   否则（大文档）：
      按章节分批生成（每章 2-3 条，分批 ≤ 6000 字符）兜底
  → 解析 + 校验：
      expected_keywords 必须逐词出现在全文原文中（防幻觉），否则丢弃该条
      expected_chapter 必须 ∈ 解析出的章节集合（LLM 输出 → 与段落章节元数据交叉校验），不匹配置 null（跨章节）
  → 汇总 cases[]
```

- **整篇一次生成的优势**：LLM 看到完整文档上下文，能生成跨章节综合题、识别章节归属（LLM 输出 expected_chapter 后与解析器章节元数据交叉校验，双向纠错）；一次调用耗时与成本远低于逐章多次；
- 输入仍是"带章节标题的原文"（章节标题保留是为了让 LLM 锚定章节、输出准确的 expected_chapter），但**不是逐章切分调用**；
- 当前模型上下文（deepseek-chat 128K）对中小文档（员工手册/合同/制度类）足够；超阈值才回退按章节分批；
- 生成器只依赖"按章节组织好的全文文本"，与来源无关（保存的段落 / 重新解析均可复用同一 `generate_from_text`）。

### 4.2 Prompt 要点（生成用例）

**整篇模式（默认）**：

```
你是 QA 用例生成专家。请阅读以下整篇文档（含章节标题），生成 {count} 条中文问答测试用例，
用于评测 RAG 系统能否基于本文档回答用户问题。

输出严格 JSON 数组，不要输出其他内容：
[{"question": "...", "expected_keywords": ["...", "..."], "expected_chapter": "章节名或null(跨章节)", "category": "事实查询|概念查询|理解推理|综合概括"}]

要求：
1. question 必须是文档能明确回答的问题；
2. expected_keywords 2~4 个，**只能使用文档原文中出现的词或短语**（评测按关键词匹配得分）；
3. expected_chapter 填写答案来源的章节标题；答案跨多章时填 null；
4. 事实查询：问具体事实/数据/条款；概念查询：问概念定义/含义；
   理解推理：问原因/关系/推断；综合概括：跨多条信息归纳；
5. 用例尽量覆盖各章节、各分类，并包含少量跨章节综合题；互不重复；
6. 不要生成原文无法回答的问题。

文档全文（含章节标题）：
{content}
```

**分批模式（大文档兜底）**：同一 prompt 的章节级变体，每批传入单章（含章节标题），要求"仅基于本章内容生成，expected_chapter 填 {chapter}"。

### 4.3 容错与质量保障

| 风险 | 应对 |
|---|---|
| LLM 输出非 JSON / 截断 | 重试 1 次；仍失败则整体（或该章）计入 `failures`，不阻断其余 |
| 关键词幻觉 | 生成后逐词校验 ∈ 全文原文，不满足则丢弃该条 |
| expected_chapter 不匹配 | 与解析器章节元数据交叉校验，不匹配则置 null（跨章节），不丢弃 |
| 文档超长（> WHOLE_DOC_LIMIT） | 自动回退按章节分批生成（每批 ≤ 6000 字符），合并去重 |
| 问题重复 | prompt 要求互不重复；生成后按 question 简单去重 |
| 分类非法 | 白名单校验，未知分类兜底为「事实查询」 |
| 文档无章节结构 | expected_chapter=null（跨章节），仍正常生成 |
| 生成耗时 | 同步模式（整篇一次调用约 10-30s，前端超时 10 分钟）；二期可任务化 |

### 4.4 返回结构

```jsonc
// POST /doc-kit/api/v1/eval/generate（body: { task_id, count?=15 }）
{
  "status": 200, "msg": "生成成功",
  "data": {
    "task_id": "xxx", "filename": "员工手册.pdf",
    "mode": "whole" | "per_chapter",
    "chapters": ["第一章", "第二章", "..."],
    "cases": [
      { "question": "公司的企业宗旨是什么？",
        "expected_keywords": ["质量树品牌", "诚信立伟业"],
        "expected_chapter": "第二章",
        "category": "事实查询" },
      ...
    ],
    "failures": [{ "chapter": "第三章", "reason": "JSON 解析失败" }]
  }
}
```

### 4.5 文档库（doc-kit 新增：任务记录 + 段落文件）

入库时 doc-kit 在持久化卷（`/app/data/documents/`）保存解析段落：

```
/app/data/documents/{task_id}.json
{ "task_id": "...", "filename": "员工手册.pdf",
  "paragraphs": [ { "text": "...", "chapter": "第二章", "section": "第一节",
                    "article": "...", "page": 5 }, ... ] }
```

```
GET /doc-kit/api/v1/documents?page=&page_size=
  列出已入库文档（task 记录 status=success + 段落文件存在性核对）：
  { list: [{ task_id, filename, paragraphs_count, created_at }], total }

GET /doc-kit/api/v1/documents/{task_id}/content
  读取该文档保存的段落（JSON），供生成使用；文件缺失 → 404 并标"文档内容不可用"
```

- 段落是解析器输出（文本 + 章节元数据），体积适中（纯文本，非原始 PDF 字节）；
- 存储卷复用 doc-kit 现有持久化卷（`dockit-data:/app/data`，与 `TASK_DB_PATH` 同级）；
- 可选二期：保存原始文件字节以支持"重新入库/重新解析"（本期仅保存段落即可满足生成）。

---

## 5. core 编排与落库

### 5.1 新接口

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| POST | `/core/eval/sets/generate` | body: { doc_id, set_name?, count? } | eval:write |

处理步骤：
1. 校验 `doc_id`（task_id）存在；可选 `set_name` / `count`（生成条数，默认 15）；
2. 转发 doc-kit `POST /api/v1/eval/generate`（body: { task_id, count }，超时 5 分钟；doc-kit 内部按"整篇一次 / 按章节分批"策略生成，core 不接触文档内容）；
3. 生成用例后：
   - 自动命名：`set_name = set_name ?? 自动-{文件名}-{MMddHHmm}`；`doc_scope = 文件名`；
   - 用例 `id` 由 core 生成（T001…T0N，保持集内唯一）；
   - 校验 question 非空、keywords 非空数组、category 在白名单（沿用 eval-set 校验）；
4. 复用 `evalSetService.importSet`（一步建集 + 导用例）落库；
5. 返回评估集详情摘要。

### 5.2 用例与文档的关联语义

- `doc_scope` 记录来源文档名；`expected_chapter` 直接来自解析器识别的文档原生章节（段落元数据）；
- **生成来源即已入库文档**：文档已在 RAG 中，生成完即可直接「运行评估集」，不存在"未入库导致评估全失败"的问题；
- 接口解耦保持：生成只读保存的段落 + LLM，**不触发新的入库动作、不依赖 Milvus/chunk 算法**。

---

## 6. 前端（client）

### 6.1 入口位置（已定稿）

评估集管理页（`EvalSets.tsx`）**「新建评估集」弹窗**内，提供两种建集方式：

```
┌ 新建评估集 ───────────────────────────────────┐
│ [手工创建]        ← 现有表单（名称/描述/手动导用例） │
│ [从文档生成]      ← 新入口（Tabs 或 Radio 切换）    │
│    ├─ 文档选择器：已入库文档列表                    │
│    │   （GET /doc-kit/api/v1/documents，           │
│    │    展示 文件名/段落数/入库时间）               │
│    ├─ 可选：评估集名称、生成条数（默认 15）        │
│    └─ 提交 → 生成 → 用例预览 → 确认创建 → 跳转详情 │
└──────────────────────────────────────────────────┘
```

流程：选择已入库文档 → `POST /core/eval/sets/generate`（`coreRequest`，超时 10 分钟，loading"正在生成用例…"）→ 结果展示（用例预览表格：问题/关键词/期望章节/分类，分页；failures 提示）→ 确认后跳转 `/eval-sets/:id`，可一键「运行评估集」（文档已在 RAG，无需再入库）。

新 API：`client/src/services/core/evalSet.ts` 增加 `listDocuments()` / `generateEvalSet(body)`；`constants.ts` 增加 `DOCUMENTS` / `SETS_GENERATE`。

### 6.2 权限门禁

- 评估集管理页：维持现有 `Eval` 权限体系（`eval:read` 看、`eval:write` 写）；
- 「从文档生成」入口仅在 `can('write','Eval')` 时可见（与新建/导入按钮一致）；
- 文档入库页（/doc-ingest）菜单与页面按 `doc:ingest` 门禁（新增权限，见 §8）——**入库人员负责上传文档进文档库，评估人员负责从文档库选文档生成评估集**，两拨人界面互不可见对方操作。

---

## 7. 模块实现清单

| 服务 | 文件 | 内容 |
|---|---|---|
| doc-kit | `src/dockit/domain/eval_generator.py`（新增） | LLM QA 生成器：输入按章节分组的段落 → prompt → 逐章生成 → JSON 解析 + 关键词原文校验 |
| doc-kit | `src/dockit/domain/document_library.py`（新增） | 文档库：入库时保存解析段落（data/documents/{task_id}.json）；列表/读取段落 |
| doc-kit | `src/dockit/api/routes.py` | `GET /api/v1/documents`、`GET /api/v1/documents/{task_id}/content`、`POST /api/v1/eval/generate`（body: task_id，服务间内部接口） |
| doc-kit | `src/dockit/domain/pipeline.py` | ingest 流程增加：解析段落后写 `data/documents/{task_id}.json`（与向量入库并行，互不阻塞） |
| doc-kit | `src/dockit/config/settings.py` | 可选参数：默认生成条数 count、整篇阈值 WHOLE_DOC_LIMIT（默认 60K 字符）、分批每批上限 |
| core | `src/modules/eval-set/service.ts` | 新增 `generateSetFromDocument(docId, params)`：转发 doc-kit → 校验 → importSet |
| core | `src/modules/eval-set/controller.ts` + `router.ts` | `POST /core/eval/sets/generate`（body: {doc_id}，eval:write） |
| core | `src/utils/docKitProxy.ts` 或新 util | core → doc-kit 的 JSON 转发（fetch） |
| core | `src/modules/permission/constants.ts` | `DEFAULT_PERMISSIONS` 追加 `doc:ingest` |
| core | `src/database/ensureSchema.ts` + `database/init/init.sql` | 权限种子追加 `doc:ingest`（admin 自动获得） |
| core | `src/app.ts`（doc-kit 代理路由） | `/doc-kit/*` 写操作（/ingest）加 `requirePermission('doc:ingest')`；健康/状态查询保持开放（见 §8） |
| client | `src/pages/EvalSets.tsx` | 「新建评估集」弹窗加「从文档生成」Tab（文档选择器 + 参数 + 用例预览 + 创建） |
| client | `src/pages/DocIngest.tsx` + `MainLayout.tsx` | 文档入库页/菜单按 `doc:ingest` 门禁（usePermission / 菜单 permission） |
| client | `src/services/core/evalSet.ts` / `constants.ts` / `types.ts` | `listDocuments` / `generateEvalSet` API 与类型 |
| client | `src/contexts/PermissionContext.tsx`（如涉及） | 权限表映射新增 `doc:ingest` → `can('*','Doc')` 能力 |

---

## 8. 权限设计（已定稿：入库 / 评估两拨人，权限分离）

### 8.1 新增权限

```
doc:ingest   文档入库    （对应前端 subject: Doc）
```

- 权限种子：`DEFAULT_PERMISSIONS`、`init.sql`、`ensureSchema` 三处追加（与 `eval:read/eval:write` 同机制，admin 角色自动获得）；
- 现有 `eval:read`（查看评估集）/ `eval:write`（管理评估集）继续用于评估侧。

### 8.2 权限矩阵

| 操作 | 权限 | 说明 |
|---|---|---|
| 文档上传入库（/doc-ingest 页 + core `/doc-kit/*` 代理的 /ingest 写操作） | `doc:ingest` | **入库人员**，负责维护文档库 |
| 文档库列表 / 详情（已入库文档，供评估选用） | 开放读（或 `eval:read`） | 只读，供生成评估集选取 |
| 评估集查看 / 管理（现有） | `eval:read` / `eval:write` | **评估人员** |
| **从文档库生成评估集**（`POST /core/eval/sets/generate`） | `eval:write` | 属于评估域，**不要求 doc:ingest**（生成只读文档内容 + LLM，不触碰入库写操作） |
| 运行评估集 / 查看评估历史 | `eval:write` / 开放读 | 评估域 |

### 8.3 隔离要点

- 入库人员（仅 doc:ingest）→ 能传文档入库（维护文档库），**不能**创建/生成/管理评估集；
- 评估人员（仅 eval:write）→ 能从文档库选文档生成评估集、运行评估，**不能**上传入库文档；
- 生成评估集内部调用的 doc-kit `eval/generate` / `documents` 是**服务间内部接口**（core → doc-kit，非用户直连），权限在 core 侧用 `eval:write` 把关，doc-kit 侧不另设用户权限；
- 前端：文档入库菜单按 `doc:ingest` 过滤，评估集管理页生成入口按 `can('write','Eval')` 显示——两拨人界面互不可见对方操作。

---

## 9. 决策点（已确认）

| 编号 | 决策点 | 结论 | 说明 |
|---|---|---|---|
| P1 | 生成位置 | ✅ **doc-kit 生成**（方案 1） | 解析+LLM 同服务，复用现有能力，core 零 LLM 依赖 |
| P2 | 是否自动入库文档 | ✅ **接口解耦，不自动入库** | 生成只产用例；运行评估前走现有「文档入库」；两拨人分工 |
| P3 | 生成条数与策略 | ✅ 默认整篇一次生成 count=15；超 WHOLE_DOC_LIMIT（60K 字符）回退按章节分批 | 小文档 LLM 上下文足够，整篇生成可出跨章节题、耗时短；大文档兜底 |
| P4 | 同步还是异步 | ✅ **同步**（本期） | 整篇一次调用约 10-30s，前端 loading + 10 分钟超时；二期任务化 |
| P5 | 用例 id 规则 | ✅ core 生成 T001…T0N | 与现有示例格式对齐，导入校验复用 |
| P6 | 权限分离 | ✅ 新增 `doc:ingest`，生成走 `eval:write` | 入库/评估两拨人权限隔离（见 §8） |
| P7 | 文档来源 | ✅ **保存解析段落，不依赖 Milvus/chunk 算法** | 入库时把 FitzParser 段落持久化（data/documents/{task_id}.json）；生成按原始段落章节分组，避免"用 chunk 产物出题测同一套 chunk"的自证式失真 |
| P8 | 规则抽取兜底 | 二期可选 | LLM 不可用时按"章节标题/条款号"生成事实查询类问题 |

---

## 10. 风险与注意事项

| 风险 | 说明 | 应对 |
|---|---|---|
| 生成质量不稳定 | LLM 输出关键词可能不在原文 | 原文校验 + 丢弃；prompt 强约束；结果可人工编辑（导入后走现有编辑接口） |
| 大文档耗时/超长 | 数百页文档逐章生成慢 | 总量上限 + 分批 + 前端超时；二期任务化 |
| doc-kit 不可达 | 生成接口依赖 doc-kit | 复用现有健康检查；失败返回明确错误 |
| 段落文件缺失 | task 记录在但段落文件被清/历史文档未保存 | 文档列表核对文件存在性，缺失标"不可用"；本期起新入库文档全部保存 |
| 段落存储增长 | 文档文本长期累积 | 纯文本体积小（KBs~MBs）；可选清理策略（二期：按保留期/手动删除） |
| 跨章节综合题 | 单章生成无法覆盖"跨章" | 可选：末尾再让 LLM 基于全文生成 1-2 条综合概括题（expected_chapter=null） |
| 权限误配 | 代理路由一刀切加权限影响健康检查 | 仅对 /ingest 写操作加 `doc:ingest`，读接口（health/status/documents）保持开放 |

---

## 11. 工作量与交付

- 新增/修改：doc-kit 4 个文件（生成器 + 文档库 + 路由 + 配置）、core 6 个文件（含权限种子）、client 4 个文件，估算 **2~3 人日**；
- 验证：入库员工手册类 PDF → 文档库列表可见 → 从文档生成评估集（校验章节数、关键词命中原文、分类分布）→ 运行评估集 → 看板出现新运行记录；另验证权限矩阵（仅 doc:ingest 用户不能建集、仅 eval:write 用户不能入库）；
- 交付物：生成模块 + 两端接口 + 权限种子 + 前端入口 + 本方案文档。

---

## 12. 变更记录

| 版本 | 日期 | 变更内容 |
|---|---|---|
| v1.4 | - | **生成策略定稿**：小文档由 LLM **整篇一次读取生成**（默认 count=15，覆盖各章节+跨章节题，expected_chapter 与解析器章节元数据交叉校验）；超 WHOLE_DOC_LIMIT（60K 字符）自动回退按章节分批；不再逐章调用 |
| v1.3 | - | **生成源改为"保存的解析段落"**：入库时持久化 FitzParser 段落（data/documents/），生成按原始段落章节分组，**不依赖 Milvus、不经 chunk 算法**——避免"用 chunk 产物出题测同一套 chunk"的自证式评估失真 |
| v1.2 | - | **文档来源定稿为"已入库文档"（文档库）**：doc-kit 新增文档列表 + 内容读取接口，无需重复上传；生成完即可运行评估；权限/入口保持 §8/§6 设计 |
| v1.1 | - | 评审定稿：P2 确认**接口解耦**（不自动入库）；新增 §8 权限设计（新增 `doc:ingest`，入库/评估两拨人权限分离，生成走 `eval:write`）；前端入口定为评估集管理页「新建评估集」弹窗内「上传文档生成」Tab |
| v1.0 | - | 初稿：doc-kit 生成 + core 编排落库方案，含 prompt 设计、接口定义、决策点 |
