# 编排架构 Review 与改进计划 — 2026-07-03

> 内部工程文档，用于指引编排系统的后续开发。非 boss-facing 文章，刻意不套 L2 的 HTML 报告格式（boss 指令：务实、按实施级别、无标语）。
> 标尺：编码 Agent 的编排方式。范围：`lib/frame.ts`、`lib/orchestrator.ts`、`lib/intent-queue-runtime.ts`、`lib/copilot-agent.ts` 答复层、`lib/functions/*`。证据取 file:line。
> 关联：设计文档 `docs/05-engineering/copilot-planning-redesign.md`（落地计划 part 5）；审查标准 L2 `.github/instructions/code-review.instructions.md`；基线 L3 `/memories/repo/review-baselines.md`。

---

## 1. 标尺：可核对的判据（不是口号）

将「编码 Agent 怎么干活」拆成 6 条可验证判据，供逐条比对：

| 判据 | 可核对的表现 |
|---|---|
| C1 无预分类 | 不存在「先把整句归进固定类别、再查表选工具」的前置步骤 |
| C2 观察→再决策 | 每步执行后读结果，据结果决定下一步；计划可中途改，目标达成即停 |
| C3 计划可变 | 步骤清单不是首个 LLM 调用一次定死、后续不可改 |
| C4 工具组合 | 复杂能力由通用原语组合，而非每种意图一个预置技能 |
| C5 结果落地校验 | 生成答复只用已获取的数据；不臆造记录/关系/日期 |
| C6 危险动作确认 | 改数据前出确认；只读/可逆动作直接执行 |

---

## 2. 发现（Findings）

每条：现象 → 证据(file:line) → 违反的判据 → 影响的用户可见 bug 类 → 评级(ABCD，依 L2)。

### F1 — 意图分解在无数据反馈下一次性定死（C1/C2/C3 违反）· D
- 证据：`lib/orchestrator.ts:266` `runIntentPipeline` 顺序为 frame(1 次) → `buildSkeleton` → orchestrator(1 次) → 执行；`lib/intent-queue-runtime.ts` 全程无 re-frame/re-plan。`lib/frame.ts:157` `buildFramePrompt` 指令「list every distinct thing… Do not pick a single label」。
- 影响：意图数在看到任何数据前锁定。派生「过度拆分」类 bug（2026-07-03「今天的客户+按优先级」被拆成 2 意图）。
- 评级 **D**（系统性、反复产生同类缺陷）。

### F2 — 唯一的「想一下 / think」步只服务改数据（C2/C4 部分违反）· C
- 证据：`lib/intent-queue-runtime.ts:817-930` `proposeChanges` 是唯一「基于前序记录推理」的步骤；查询/分析类无对应原语，仅靠答复层 prompt 自觉。
- 影响：分析/排序/汇总类无法「基于上一步查询结果」推理，只能整表重拉或靠模型不飘。
- 评级 **C**。

### F3 — 答复层 grounding 曾不对称（C5）· 今日修复后 B
- 证据：单意图 `lib/copilot-agent.ts:1409` 已有 rule-6「只用返回数据作答，不得声明数据不支持的关系」；多意图 `summarizeDAGResults`（`lib/function-registry.ts` promptTemplate）此前**无**此约束——2026-07-03 报告的臆造发生在此路径。今日已补护栏。
- 影响（历史）：多意图 summary 把管线客户说成「今天的拜访」、挪错日期。
- 评级 **B**（补护栏后；仍是 prompt 级、模型依赖，非结构保证）。

### F4 — 活/死两套并行分类管线，已漂移（C4，L2 重复红线）· C
- 证据：`lib/frame.ts`（live，`orchestrator.ts` 引用）与 `lib/frame-shadow.ts`（`shadow-agent.ts:219` 引用，仅 `components/frame-shadow-viewer.tsx` 调试用）各有一份 `buildFramePrompt`（frame.ts:157 / frame-shadow.ts:149）与 `suggestSkillForIntent`（frame.ts:615 / frame-shadow.ts:569）。**今日 F1 相关修复只进了 frame.ts，frame-shadow.ts 未同步。**
- 影响：分类逻辑双份，长期必然继续漂；调试视图与线上行为不一致。
- 评级 **C**。

### F5 — `suggestPlan` 是「造新任务」技能，构成 fabrication 面（C5）· C
- 证据：`lib/functions/misc-handlers.ts` `suggestPlan`：`targetDate` 默认明天（L120），`maxTasks` 默认 5，从 `OpportunityService.getAll()`(top15)+`AccountService.getAll()`(top10) 生成 CRM 中不存在的任务。
- 影响：一旦被误路由（F1），生成的虚构任务会被当作事实呈现。今日已修其 UTC 日期偏差（L114），但「造任务」本质未变。
- 评级 **C**。

### F6 — 静态 intent→skill 映射（C4）· C
- 证据：`lib/frame.ts:615` `suggestSkillForIntent` 为 6×9 的 switch；`Analyze+Activity → suggestPlan`（L652-655）。「组合式覆盖」仅在 merge（proposeChanges）实现，其余 1:1。
- 影响：新动词（顺延/拆分/去重变体）需手写映射/规则——即 recurring 救火。
- 评级 **C**。

### F7 — 上帝对象 `contexts/copilot-context.tsx` 3426 行（L2 god-object 红线）· C
- 证据：编排 glue + 查询失效 + 队列构建 + 话术，单文件 3426 行（硬红线 800 的约 4×）。
- 影响：编排相关改动集中在一处，回归面大、可测性低。
- 评级 **C**（历史债，冻结增长 >10%）。

### 已核验为达标项（不列为缺陷）
- C6 危险动作确认：改数据全走 `proposeChanges`+确认卡（`intent-queue-runtime.ts:817`）。**A**。
- 可观测恢复（L2 不变量 7）：retry/fallback 均 `console.warn` + `PipelineResult` flag（`orchestrator.ts` planRetried/planRetryReason）。**A**。
- I/O 契约：registry `responseFormat`+`outputSchema`(Zod)。**A**。
- 静默 `catch{}`：全库扫描未发现。**A**。

---

## 3. 根因分析

单一机制解释 F1/F2/F3/F5/F6：**编排是「先归类→静态选工具→一次性建 DAG→执行→汇总」的一次性前向管线，缺 observe→revise 回路。**

- 分类（frame）在**无数据**时决定意图数与结构，且提示词奖励「尽量拆」，故对修饰词（排序/筛选/时段）过度拆分。
- 选工具是**静态映射**，`Analyze` 是 catch-all 且落到 `suggestPlan`（整表、造任务、上下文无关），故「看已有记录」被误当「重新规划」。
- 无回路 → 首个 LLM 调用错了就一路错到底（仅 parse 失败才 retry，`orchestrator.ts:345`）；最终 summary 只能靠 prompt grounding 兜底（F3）。

结论：这些不是各自独立的 bug，是同一根「计划先于观测、且不可修正」的派生。逐句加 frame 规则只堵单个出口。

---

## 4. Level 0 — 今日已完成（已 push，未 commit）

| 改动 | 文件 | 验收 |
|---|---|---|
| 分解契约原则化：排序/排名/筛选/范围/时段/数量修饰词=同一查询意图的参数，不拆第二意图，不把 Find 翻成规划 | `lib/frame.ts` buildFramePrompt「Do NOT split」+ Analyze BOUNDARY | 「今天要拜访哪些客户？给我按优先级排序」→ 1 意图(Activity/Find) |
| 多意图答复补 grounding 护栏 | `lib/function-registry.ts` summarizeDAGResults promptTemplate | 不得把管线/客户列表说成「今日拜访」、不得改记录日期 |
| suggestPlan 用本地日历日期（去 UTC 偏差） | `lib/functions/misc-handlers.ts:114` | 「今日」不再差一天 |

线上活验：受 player `ERR_ABORTED` 阻塞，待验证短语「我今天要拜访哪些客户？给我按优先级排序」→ 预期 1 意图 + 仅当日真实拜访。

---

## 5. 改进计划（按实施级别）

每级独立可验证、可回滚。回归门：`pnpm vitest run`（≥210/211）+ `copilot-studio/eval-csv` 场景集。

### Level 1 — 收口与防漂移（低风险，无架构改动，立即）
- **1.1 消除 F4 双管线**：判定 `frame-shadow.ts`/`shadow-agent.ts` 是否仍需。
  - 若否 → 删除，移除 `components/frame-shadow-viewer.tsx` 引用。
  - 若是（保留调试对照）→ 抽 `buildFramePrompt`/`suggestSkillForIntent` 到单一源，两管线共用。
  - 验收：分类 prompt 与 intent→skill 映射只剩 1 处逻辑源；今日 frame.ts 契约对两条路径同时生效。
- **1.2 收窄 F5 `suggestPlan`**：输出增加 `isSuggestion` 标识，前端区分真实记录与 AI 建议任务；补单测覆盖 `targetDate` 默认与 window 解析。
  - 验收：结果卡带「AI 建议」标识；`suggestPlan` 有 `__tests__`。
- **1.3 锁定今日 grounding 契约**：给 `summarizeDAGResults` 加回归单测（固定输入快照，断言输出不出现「今日拜访」误标）。
  - 验收：vitest 新增用例。

### Level 2 — 最小 observe→decide（中风险，核心，eval 门）
目标：查询/分析类从「一次定死」改为「查 → 基于结果 grounded-think」。
- **2.1** Report/Analyze 意图在 DAG 中强制 `dependsOn` 其数据查询步；think 步复用 `proposeChanges` 的 result-forwarding，对**前步结果**推理，不再另拉全量。
- **2.2** 退役 `Analyze→suggestPlan` 对「看已有记录」类的路由：`suggestPlan` 仅保留「显式未来规划」；其余 Analyze 走 query→think（`frame.ts:652` + `suggestSkillForIntent`）。
- **验收**：eval-csv 全过；新增用例覆盖「今天/本周的 X + 排序/筛选」与「which accounts to focus」的分流；无 fabrication。
- **风险**：触碰路由与 DAG 依赖 → 分步提交，双门（vitest+eval-csv），每步可回滚。

### Level 3 — 结构性（高风险，独立立项，非必要不与 L2 混做）
- **3.1** frame 输出「步骤清单」替代 6×9 预分类（design part 5.1）；覆盖靠组合。
- **3.2** 静态 intent→skill 映射让位组合式规划（F6 根治）。
- **3.3** 拆 `copilot-context.tsx` 3426 行（queue-build / invalidation / ack 抽出）。
- **门槛**：每项独立 PR + eval 全绿 + 可回滚。

---

## 6. 明确不做（scope guard）
- 不做全自动无限循环 agent —— 只做有限步 + think 步。
- 不做计划 DSL —— 步骤就是简单数组。
- 不做并行执行 / 自动回滚重试 —— 顺序、可预测优先。

## 7. 状态与下一步
- Level 0 已 push，未 commit（全 session 改动待 boss「提交」）。
- 待定：Level 2（拔根）是否现在开工；本 review 是否按 L2 渲染 HTML 存档。
- 复审触发：见 L3 趋势红线（规模 ≥25% 或任一维度降档）。
