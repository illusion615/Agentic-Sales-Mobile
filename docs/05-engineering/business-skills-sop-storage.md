# Dataverse Business Skill / SOP 存储方案

> 设计目标：让本项目 `copilot-studio/skills/*.SKILL.md` 中的业务 SOP 成为可共享、可治理、可迁移的 skill 资产。
> **方案**：复用官方 Dataverse **Business skills**。
> **交付跟踪**：[`generative-ui-skill-platform-execution-plan.md`](generative-ui-skill-platform-execution-plan.md) 阶段 3。

---

## 0. 设计结论

本项目的 skill 不存 CRUD 原子能力。Dataverse 的表级 CRUD、元数据读取、查询和写入本来就是平台 / MCP / generated services 的能力层，不需要业务用户逐条登记。

`copilot-studio/skills/*.SKILL.md` 的内容已经是 SOP 型 business skill：

- `log-sales-activity`：判断活动类型、解析客户、查日历、确认草稿、写 Dataverse、必要时建日历事件。
- `manage-account-contact`：决定 account/contact、解析父客户、确认、创建或更新。
- `manage-opportunity`：解析金额、阶段、日期、客户绑定，确认后写商机。
- `plan-and-recommend`：读取商机与活动，生成计划，必要时交给活动 skill 安排日程。
- `query-and-report`：按问题识别实体和过滤条件，读取多表并输出数字优先的报告。

因此，存储对象是**业务流程说明**，而不是 `queryAccount` / `createContact` 这类原子工具。直接复用官方 Business skills，不自建 skill 表。

---

## 1. 复用官方 Dataverse Business skills

Microsoft Learn 对 Business skills 的定义与本项目目标一致：

| 官方结构 | 含义 | 本项目映射 |
|---|---|---|
| Metadata | `Name` + `Description`，供 agent 快速发现 relevant skills | `.SKILL.md` frontmatter 的 `name` / `description` |
| Instructions | 完整 skill body，Markdown 格式，含流程步骤、规则、示例、输入输出要求 | `.SKILL.md` 正文 |
| Resources | 可附加 SOP、模板、表单、计算说明等资源文件（20 MB） | 后续可放产品表、字段映射、政策说明 |
| Sharing / visibility | Owner、share、organization visibility | 技能管理员治理 |
| Solution-aware | 可加入 solution 做 ALM | 随 Agentic Sales Mobile solution 跨环境迁移 |

官方 Business skills 原生支持：

- 通过 Power Apps 页面创建、编辑、分享、停用、删除。
- 直接上传 `Skill.md` 或 `.zip`（30 MB）。
- 通过 Dataverse MCP server 的 `upsert_skill`、`delete_skill`、`search`、`describe` 工具创建/更新/检索。
- 在 solution 中通过 **Add existing > Business skill** 打包迁移。

### 1.1 与现有 `.SKILL.md` 的双向映射

| `.SKILL.md` 片段 | Business skills 字段 |
|---|---|
| frontmatter `name` | Name |
| frontmatter `description` | Description |
| Markdown 正文（从 `# Skill:` 开始） | Instructions |

```md
---
name: log-sales-activity
description: Record a sales activity...
---

# Skill: Log a sales activity

When this skill is activated:
1. ...
```

- **导入到 Business skills**：frontmatter 进入 metadata，正文进入 Instructions。
- **从 Business skills 导出为文件**：Name / Description 重新生成 frontmatter，Instructions 原样写回正文。

### 1.2 Runtime 使用方式

| Runtime | 使用方式 |
|---|---|
| Copilot Studio 后端 agent | 通过 Dataverse MCP server `search` / `describe` 发现并读取 Business skills；agent instructions 中要求「先查找相关 business skill 并遵循其流程」。 |
| VS Code / 其他 agent | 连接 Dataverse MCP server 后同样使用 `search` / `describe`。 |
| 当前 Power Apps Code App 前端 | 待验证：官方 Business skills 能否通过 Power Apps SDK / generated service 直接读取，或需经 Dataverse MCP server 访问（见 §4）。 |

> 关键边界：Business skill 是自然语言 SOP，不是可执行代码。真正的 Dataverse 读写、Calendar、Knowledge Agent handoff 等能力仍由 runtime 的 tools / generated services / connectors 提供。

---

## 2. 如何启用 / 激活官方 Business skills

### 2.1 环境前置

官方要求：环境必须启用并配置 **Dataverse MCP server**。

Power Platform 管理员在 Power Platform admin center 中检查：

1. 打开 [Power Platform admin center](https://admin.powerplatform.microsoft.com/)。
2. 进入 **Manage > Environments**，选择目标环境。
3. 进入 **Settings > Product > Features**。
4. 找到 **Dataverse Model Context Protocol**。
5. 确认 **Allow MCP clients to interact with Dataverse MCP server** 已开启。
6. 如需 VS Code GitHub Copilot、Claude 等非 Copilot Studio 客户端，进入 **Advanced Settings**，打开对应 client 记录，将 **Is Enabled** 设为 **Yes**。

说明：Copilot Studio 的 Dataverse MCP client 默认启用；非默认 client 需管理员显式 allowlist。

### 2.2 打开 Business skills 页面

1. 进入 [Power Apps maker](https://make.powerapps.com)。
2. 左侧导航选择 **More > Business skills**。
3. 可将 **Business skills** pin 到左侧导航。

若看不到入口，优先检查：

- 当前环境是否启用 Dataverse MCP server。
- 当前用户是否有 Basic User / Environment Maker / System Administrator / System Customizer 角色。
- 租户/环境是否已开放该功能（文档更新时间 2026-06-24，以当前环境 UI 为准）。

### 2.3 创建、上传、共享与打包

| 动作 | 官方入口 |
|---|---|
| 新建 | Business skills 页面 > **New business skill** |
| 上传现有 skill | **Upload business skill**，上传 `Skill.md` 或 `.zip` |
| 编辑 | 打开 skill > Edit，修改 Name / Description / Instructions / Resources |
| 停用 | 选择 skill > Deactivate；停用后 agent 不再发现/使用 |
| 分享 | Share，选择 Viewer / Co-owner |
| 组织可见 | Viewable by > Organization |
| 加入 solution | Solutions > Add existing > Business skill |
| 通过 agent 管理 | Dataverse MCP server 工具 `upsert_skill` / `delete_skill` / `search` / `describe` |

---

## 3. 现有 skill 迁移步骤

> 状态（2026-06-27）：第 1–4 步已完成——5 个 `.SKILL.md` 已上传到 DV Business skills 并加入 solution。第 5–6 步（agent instructions 接入与逐条测试）与 §4「Code App 读取路径」为当前开放项。

1. 在目标环境启用 Dataverse MCP server（§2.1）。
2. 打开 **Power Apps > More > Business skills**。
3. 使用 **Upload business skill** 上传当前五个文件：
   - `copilot-studio/skills/log-sales-activity.SKILL.md`
   - `copilot-studio/skills/manage-account-contact.SKILL.md`
   - `copilot-studio/skills/manage-opportunity.SKILL.md`
   - `copilot-studio/skills/plan-and-recommend.SKILL.md`
   - `copilot-studio/skills/query-and-report.SKILL.md`
4. 将 skills 加入项目 solution：**Solutions > Add existing > Business skill**。
5. 在 Copilot Studio agent instructions 中加入：先通过 Dataverse MCP server 查找 relevant business skill，并遵循其 instructions。
6. 用真实场景逐条测试，必要时编辑 Instructions。

---

## 4. 读取 Business skills 的方式与官方建议（调研结论）

> 调研日期 2026-06-27，来源：Microsoft Learn `data-platform-mcp` / `data-platform-business-skills` / `data-platform-business-skill-overview`，及 Dataverse 实体参考。

### 4.1 有哪些读取方式

| 方式 | 是否官方文档化 | 说明 | 适配 Code App？ |
|---|---|---|---|
| **Dataverse MCP server**（`search` + `describe`） | 是（推荐） | 端点 `https://{org}.crm.dynamics.com/api/mcp`。`search` 按关键词搜 business skills 元数据，`describe` 取完整 instructions——正是官方「先查元数据、需要时再取正文」的分层检索。`upsert_skill`/`delete_skill` 用于写。 | 间接。MCP 是 **agent 入口**（`/api/mcp`），面向 LLM agent 客户端；需 MCP allowlist，且在 Copilot Studio 之外调用按 Copilot credit 计费（2025-12-15 起）。SPA 直连不自然。 |
| **Maker UI / Solution** | 是 | `More > Business skills` 页面创建/编辑/停用/分享；solution ALM 跨环境搬运。 | 仅作者/运维用，非运行时读取 API。 |
| **直接 OData / Web API 表读取** | **已实测可行**（见 §4.4） | business skill 存于标准表 `skill`（entitySet `skills`），`/api/data/v9.0/skills` 返回 `name`/`description`/`body` 等。该表未收录进公开实体参考文档，但在环境中是标准可查表；`fabricaiskill` 是另一个（Fabric）功能，无关。 | **是**。加 `skills` 为数据源即可像 account/contact 一样读。 |

### 4.2 官方建议

官方明确：**通过 Dataverse MCP server 使用 business skills**（overview 原文「Access skills through the Dataverse MCP server」「query metadata to find applicable skills, then retrieve full instructions only when needed」）。即推荐路径 = MCP `search` + `describe`。

### 4.3 和谐架构：SOP 知识共享，执行按输出类型分流

冲突的根因不是「skill vs UI」，而是「谁来执行 + 渲染」放错层。把两件正交的事分开：

- **流程知识层（SOP）**：步骤、规则、字段映射、确认策略——自然语言，业务可维护。单一事实源。
- **执行 + 渲染层**：谁跑步骤、产出什么形状给前端。generative UI 依赖**结构化输出契约**（renderer 认得的 JSON：列表卡、草稿表单、模糊匹配卡）。

CS agent 返回自然语言文本，不产出 renderer 契约——所以把需要富 UI 的数据操作交给 CS 执行，就会绕过本地渲染器、退化成聊天气泡。**结论：需要富 UI 的数据操作，执行权必须留在本地管线。**

按「需要什么输出」分流，而非按 skill 分：

| 意图类型 | 执行者 | 输出 | 读 SOP 的方式 |
|---|---|---|---|
| 查询→列表、建/改→草稿确认（要富 UI） | **Code App 本地 Frame/Orchestrator** | 结构化 JSON → AI 原生控件 | 见 §4.5 |
| 产品知识/自由问答（本就纯文本） | CS agent（已接 `queryCopilotStudio`） | 文本气泡 | MCP `search`/`describe`（已可用） |

合力点：① 同一份 SOP，CS agent 与本地管线都读 → 消除「两脑漂移」；② 本地管线保住 renderer 契约 → SOP 变了富 UI 照常；③ SOP 可声明界面意图（「写库前需确认」「列表显示这几列」），本地渲染器照此渲染 → **SOP 直接驱动 UI**。

### 4.4 技术验证结论（2026-06-27，**已确认运行时可读**）

外部已登录浏览器对环境 `https://org1cd97ca4.crm.dynamics.com/api/data/v9.0/skills` 实测：**business skill 就是一张标准可查 Dataverse 表 `skill`（entitySet `skills`），OData 直接返回全部 5 条记录的完整内容。** 之前「无 OData 实体」的结论被推翻——该表只是未收录进公开实体参考文档，但在环境中是标准表。

| 验证项 | 结论 |
|---|---|
| 表 logical name / entitySet | `skill` / `skills`（Standard 表，User/team 所有制，Web API v9.0） |
| 可读字段（本项目需要的） | `name`（skill 名）、`description`（路由信号）、`body`（完整 Markdown SOP = Instructions）、`statecode`/`statuscode`（启用态）、`uniquename`（带 `crf5c_` 前缀）、`skillid`（主键） |
| Code App 能否读 | **能**。与 account/contact 同理，加 `skills` 为数据源即可经 generated service / OData 读取；平台按用户权限裁剪（`_ownerid_value` / `ispersonal`）。 |
| 集成浏览器 401 的原因 | 该浏览器上下文未登录此 org，非方法问题；外部已登录浏览器正常返回 JSON。 |

> 含义：`skill` 表 = 官方 Business skill 的存储表，字段正好是 **metadata（name+description）+ Instructions（body）**，与本项目 `.SKILL.md` 的 frontmatter + 正文一一对应。

### 4.5 确认后的和谐方案：Code App 运行时直读 `skill` 表

运行时直读已确认可行，故采用比构建期打包更优的形态：

- **CS agent**：经 MCP `search`/`describe` 读 `skill` 表 → 负责纯文本意图（路 1）。
- **Code App 本地管线**：把 `skills` 加为**只读数据源**，运行时读 `name`/`description`/`body`，喂给本地 Frame/Orchestrator；结构化输出契约与渲染器留在代码 → **保住 generative UI**（路 2，运行时版）。
- **同一张 `skill` 表，两个大脑都读** → 无「两脑漂移」；**业务在 maker 改 skill → 对 CS agent 与 Code App 都生效**（Code App 侧带缓存，刷新即取最新，**无需重构建/部署**）。
- `copilot-studio/skills/*.SKILL.md` 退为**作者源 / 上传种子 / 版本留痕**，运行时不再依赖它。

安全：`skill` 表读取受 Dataverse 安全角色 + owner 裁剪；加载层对 `body` 做基本校验，坏行跳过并告警（与现有数据层一致）。

### 4.6 落地下一步（属阶段 3，动代码前需老板确认）

1. 把 `skills`（logical `skill`）加为只读数据源：`npx power-apps add-data-source`（**禁用** `pac code add-data-source`）。**会生成 service/model 文件、可能触发冷编译**，故执行前确认。
2. 新增 `skill-loader.ts`：读 `skills`（`statecode` 启用）、取 `name`/`description`/`body`、带缓存与失效、坏行跳过。
3. 把 loader 输出接入本地 Frame/Orchestrator，用 SOP `body` 替换写死的 per-skill 流程逻辑；保持结构化输出契约不变。

---

## 5. WorkIQ 作为本地管线的 capability adapter（日历等）

> **范围更新（2026-06-28）**：WorkIQ 仍是日历/空闲场景的可选增强，不阻塞「skill 即 SOP」主线；但已按老板指令启动技术可行性验证。本节记录活体探测证据：Custom API 壳与 submit/status 协议可调通，后台执行到终态与日历 free/busy 结果尚未证明。

环境里已安装一组 unbound Dataverse Custom API（截图于 CS 流程「Perform an unbound action」可见），其中与日历相关的是 WorkIQ 任务执行器。它给本地管线补上 SOP 所需的「Work IQ Calendar」能力，与 CS agent 同源。

### 5.1 已确认签名（2026-06-27，外部已登录浏览器查 `customapis`）

参数 type：`10=String`、`11=StringArray`、`3=Entity`。所有 action：`bindingtype=0`（unbound）、`isprivate=false`、`executeprivilegename=null`。

| Custom API | 类型 | 必填入参 | 可选入参 | `results` |
|---|---|---|---|---|
| `ExecuteWorkIQTask` | Action(POST) | `workspaceId` | `instructions`、`skillNames`(数组)、`sessionId`、`actionId`/`actionDecision`/`actionReason`、`configJson`、`workspaceFilesBase64`、`partnerSource` | Entity |
| `McpExecuteWorkIQTask` | Action | `workspaceId` | 同上 | **String（优先，SPA 好解析）** |
| `GetWorkIQTaskStatus` | Action | `sessionId`+`workspaceId` | — | Entity |
| `McpGetWorkIQTaskStatus` | Action | `sessionId`+`workspaceId` | — | String |

### 5.2 形态与集成方式

- **可调性**：unbound Custom API，Code App 经现成 `executeAsync({action:'customapi', operationName:'McpExecuteWorkIQTask', ...})` 调用，与调 AI prompt 同机制。
- **不是日历 CRUD**：是**通用异步 agent 任务器**——传 `instructions`(NL) + `skillNames` + `workspaceId`，提交后用 `*GetWorkIQTaskStatus(sessionId, workspaceId)` **轮询**。
- **审批回环 = 契合草稿确认 UI**：`actionId + actionDecision + actionReason` 是「WorkIQ 提议动作 → 用户决定 → 续跑」，正好映射成 generative-UI 的草稿确认卡。
- **同源**：与 CS agent 用的 Work IQ Calendar 是同一套 → 行为一致。

### 5.3 未知项（须 spike 才能定可行）

1. `workspaceId` 取值（WorkIQ workspace，未知如何获取）。
2. 日历对应的 `skillNames`（WorkIQ 自有技能名，非本项目 business skill）。
3. `results` 实际 JSON 形状（能否拿到结构化 free/busy 槽位喂渲染器）。
4. 异步轮询时延与多轮审批的 UX 成本。
5. WorkIQ licensing。

### 5.4 活体验证进展（2026-06-28）

已确认：

1. **认证与权限可达**：Dataverse CLI profile `agentic-dev` 可访问 `https://org1cd97ca4.crm.dynamics.com/`，`WhoAmI()` 返回当前用户与 org。
2. **四个 WorkIQ Custom API 存在且 public**：`ExecuteWorkIQTask` / `McpExecuteWorkIQTask` / `GetWorkIQTaskStatus` / `McpGetWorkIQTaskStatus` 均为 unbound action，`executeprivilegename=null`。
3. **schema 已由 live discovery 确认**：`Execute*` 必填 `workspaceId`，可选 `instructions` / `skillNames` / `sessionId` / `actionId` / `actionDecision` / `actionReason` / `configJson` / `workspaceFilesBase64` / `partnerSource`；`Get*Status` 必填 `workspaceId` + `sessionId`。
4. **submit 可成功**：用 `workspaceId=efcd2d46-3d9e-e31a-a9d8-5481ddae951c`（Power Apps environment id）调用 `ExecuteWorkIQTask` 与 `McpExecuteWorkIQTask`，可返回 `session_id`、`workspace_id`、`state="starting"`、`is_terminal=false`。
5. **返回形状可解析**：非 MCP API 返回 expando entity；MCP API 返回 `results` JSON string，更适合 Code App 前端解析。

尚未确认：

1. **状态语义不可靠**：真实 session 与假 session（`ses-does-not-exist`）调用 `McpGetWorkIQTaskStatus` 都返回 `state="starting"`、无 error、无 final_response。说明 status API 目前不能证明任务存在或后台已实际执行。
2. **未拿到终态结果**：多次轮询真实 session 仍停留在 `starting`（曾短暂出现 `running`，随后又回到 `starting`），没有 `final_response`，不能证明能拿到 free/busy 或自然语言结果。
3. **`workspaceId` 的权威来源未定**：environment id 可被 submit 接受，但 API 似乎不校验 workspace；仍需确认 WorkIQ 真实 workspace 语义。
4. **Calendar skillName 未定**：Business skills 里的 5 个 SOP 名称不是 WorkIQ 自有 `skillNames`；`Work IQ Calendar` 的底层 skillName 仍需从平台文档或真实 Copilot Studio 调用中取证。

阶段性结论：**Code App 调用层可实现，后台 WorkIQ 执行层尚未闭环**。下一步不应直接接 UI，而应先做一个受控 PoC：使用已确认的 environment id 或平台文档给出的 workspace id，发明确只读的 calendar/free-busy 指令，要求在限定轮询次数内出现 `is_terminal=true` 或明确 error；否则视为当前环境 WorkIQ backend / license / workspace 配置未就绪。

---

## 6. 技术可行性论证计划（spike 序列，先论证后实现）

原则：每个 spike 有明确「触碰范围 / 风险 / 由谁跑 / 成功判据 / go-no-go」；前一个不过不进下一个；论证用最小改动，**业务管线重构留到全部 spike 通过、设计定稿后**。

| # | Spike | 目标 | 动作 / 触碰范围 | 风险 | 由谁跑 | 成功判据 | Gate |
|---|---|---|---|---|---|---|---|
| S1 | 接 `skills` 只读数据源 | 证明 Code App 能运行时读 `skill` 表 | `npx power-apps add-data-source`（生成 service/model + 改 power.config）；**可能需交互登录** | 生成文件；后续 build 冷编译 | 需老板授权（交互登录可能要你操作） | 生成 `SkillsService`，能取 5 条 `name`/`description`/`body` | 通过→S2 |
| S2 | `skill-loader` 只读验证 | 证明加载 + 校验 + 缓存可用 | 新增 `src/lib/skill-loader.ts`（独立模块，不接入管线）+ 单测 | 低（不动现有管线） | 我 | 单测读到启用 skill、坏行跳过、缓存命中 | ✅ 通过→S5 |
| S3 | WorkIQ API 壳探测 | 解开 §5.3 的 API 可达性 / 参数 / 返回形状 | Dataverse CLI live discovery + raw Web API submit/status | 低（只读指令） | 我 | API 存在、可提交、能返回 session/status 形状 | ⚠️ 部分通过，见 §5.4 |
| S4 | WorkIQ 后台执行 PoC | 证明任务能从 `starting` 到 terminal，并拿到可解析结果 | 调 `ExecuteWorkIQTask` / `McpExecuteWorkIQTask` + 轮询；不接 UI | 中（真实 WorkIQ backend / license / workspace 依赖） | 我 | `is_terminal=true` 且有 `final_response` 或明确 error | ❌ 未通过，卡在 `starting` |
| S5 | 设计定稿 | 合并 S1–S2 结论，定 skill-loader 接入方案（WorkIQ 列为可选 adapter） | 仅文档 | 无 | 我 | 出最终集成设计 + 改造任务拆解 | ✅ 见 §7，经老板确认→进实现 |

### 6.1 执行进度（2026-06-28）

- **S1 已完成（用对了 CLI）**：根因 = 本项目的 `power-apps` CLI（`@microsoft/power-apps-cli@0.11.0`）是 `@microsoft/power-apps` 的**传递依赖**，pnpm 不把它的 bin 链到顶层 `node_modules/.bin`，故 `npx power-apps` 失效（会拉占位包）。正确做法 = 直接 node 跑它的 Bin.js：
  ```
  node node_modules/.pnpm/@microsoft+power-apps-cli@0.11.0_tslib@2.8.1/node_modules/@microsoft/power-apps-cli/dist/Bin.js \
    add-data-source --api-id dataverse --resource-name skill \
    --org-url https://org1cd97ca4.crm.dynamics.com/ --non-interactive --no-color
  ```
  npm CLI 无 PAC v1.52.1 的 Dataverse bug、用缓存认证无需登录、**干净生成** `src/generated/services/SkillsService.ts` + `models/SkillsModel.ts`，并在 `dataSourcesInfo.ts`/`power.config.json`/`.power/schemas/dataverse/businessskills.Schema.json` 正确注册，`index.ts` 无损。`SkillsModel` 确认 `statecode` 0=Active/1=Inactive。（教训已沉淀进 `/memories/repo/project-facts.md`：PAC code 对 Dataverse 有 bug，永远用此 npm CLI；禁止手工接。）
- **S2 已完成**：`src/lib/skill-loader.ts` 改为用生成的 `SkillsService.getAll()`，按 `statecode===0` 过滤启用项、坏行跳过、缓存与降级；`src/__tests__/skill-loader.test.ts` **4 单测全过**，类型检查无错。
- **S1 运行时端到端已确认（2026-06-28）**：`npm run dev` + Local Play 登录后，应用内通过 `loadSkills()` 真实读到 `skill` 表，控制台打印 `[SKILL-TEST] loaded 5 skills: manage-account-contact, query-and-report, log-sales-activity, manage-opportunity, plan-and-recommend`。证明数据源 + 生成服务 + SDK in-iframe 调用整链可用；临时探针已从 `src/main.tsx` 移除。
- **S3/S4（WorkIQ）已启动验证（2026-06-28）**：Custom API 壳、参数、返回形状和 submit/session 创建已确认；`McpGetWorkIQTaskStatus` 的状态语义尚未成立，真实 session 与假 session 都返回 `starting`，未拿到 `is_terminal=true` / `final_response`。阶段性结论见 §5.4：**前端调用层可做，后台执行层未闭环**。
- **S5 设计定稿完成**：见 §7。

实现（业务管线重构、UI 接入）在老板确认 §7 后才开始，按执行计划阶段 3 推进。

---

## 当前设计决策

1. **复用官方 Dataverse Business skills** 作为 SOP 存储（CS agent 运行时消费），原生支持 Name / Description / Instructions / Resource / Sharing / Activate-Deactivate / Solution ALM / Skill.md upload。
2. **不存 CRUD capability**，不建 `targetTable` / `handlerKey` / `operation`；不建自定义 skill 表。
3. **和谐架构 = SOP 知识共享 + 执行按输出类型分流**（§4.3）：富 UI 数据操作由 Code App 本地管线执行以保住 generative UI；纯文本意图走 CS agent。
4. **单一 SOP 源 = DV `skill` 表**（§4.4/4.5）：CS agent 经 MCP 读；Code App 本地管线加 `skills` 为只读数据源**运行时直读** `name`/`description`/`body`。业务在 maker 改 skill → 两者都生效，Code App 侧无需重构。
5. **`copilot-studio/skills/*.SKILL.md`** 退为作者源 / 上传种子 / 版本留痕，运行时不再依赖。
6. **WorkIQ 作为本地管线日历 capability（可选）**（§5）：经 unbound Custom API `McpExecuteWorkIQTask` 调用，异步 + 审批回环契合草稿确认 UI。当前已证明 API 壳可调，尚未证明后台能返回终态业务结果。
7. **保持 Markdown SOP 原形**，兼容现有 `copilot-studio/skills` 与官方上传机制；结构化 step DSL 留作后续按需。
8. **论证先行**：§6 spike 序列中 S1/S2 已通过（含 S1 运行时端到端），S3 部分通过、S4 未通过，**S5 设计已定稿（§7）**；业务管线重构待老板确认后进入阶段 3，WorkIQ adapter 不进入首批实现。

---

## 7. S5 集成设计定稿（2026-06-28）

> 依据：S1（运行时直读 `skill` 表已实测）+ S2（skill-loader 加载/校验/缓存/降级单测全过）。WorkIQ 为可选 adapter；§5.4 已证明 API 壳可调，但后台执行结果未闭环，不进首批实现。

### 7.1 目标形态

`skill` 表（Dataverse Business skills）= 唯一 SOP 源。Code App 本地管线在运行时读取 `name`/`description`/`body`，用 SOP 文本驱动 Frame 的 skill 选择与 Orchestrator 的步骤编排；结构化输出契约与渲染器保留在代码，generative UI 不受影响。业务用户在 maker 改 skill → CS agent 与 Code App 同时生效，Code App 侧刷新缓存即取最新，无需重构建/部署。

### 7.2 接入点（动代码前需老板确认，属阶段 3）

| 层 | 现状 | 接入改造 |
|---|---|---|
| **加载** | `skill-loader.ts` 已就位（读 `skills`、`statecode===0` 过滤、缓存、降级），单测通过 | 在 app 启动时预热一次 `loadSkills()`，订阅缓存失效（手动刷新 / TTL）。 |
| **Frame（意图分类）** | `src/lib/frame.ts` 用内置 skill 元数据做多意图分类 | 用 SOP 的 `name`+`description` 作为路由信号注入分类上下文，替换/补充写死的 skill 描述。 |
| **Orchestrator（DAG）** | per-skill 流程逻辑部分写死 | 用 SOP `body` 作为该 skill 的步骤指引喂给编排，**保持结构化输出契约不变**（renderer schema 仍在代码）。 |
| **降级** | — | `skill` 表读不到 / 为空 → loader 返回 `[]`，管线回退到现有内置逻辑，保证不因 SOP 源故障而中断。 |

### 7.3 不做 / 边界

- 不把可执行能力搬进 `skill` 表：Dataverse 读写、Calendar、Knowledge Agent handoff 仍由 runtime tools / generated services / connectors 提供；`body` 只是自然语言 SOP。
- 不引入结构化 step DSL（保持 Markdown 原形），按需再议。
- WorkIQ 日历 adapter（§5）按可选项，当前只确认 API 壳可调；在没有终态结果与 calendar skillName 前，不接入用户 UI。

### 7.4 风险与缓解

- **SOP 质量漂移**：业务自由编辑 `body` 可能与代码侧契约不符 → loader 已对坏行跳过并告警；接入时对关键 skill 增加「契约字段存在性」轻校验，失败回退内置逻辑。
- **缓存陈旧**：maker 改 skill 后 Code App 未刷新 → 提供手动刷新入口 + 合理 TTL；published 环境与 dev 同源读同一张表。
- **冷编译成本**：接入改动会触发一次 `tsc -b` 冷编译（50–90min，I/O-bound，勿杀）——纳入阶段 3 排期。

### 7.5 改造任务拆解（阶段 3，待确认后启动）

1. app 启动预热 `loadSkills()` + 缓存失效订阅。
2. Frame 注入 SOP 路由信号（`name`/`description`），保留内置回退。
3. Orchestrator 以 SOP `body` 驱动步骤指引，结构化输出契约不变。
4. 端到端回归：5 个 skill 各跑一遍，对照现有行为无回退；坏数据/空表降级验证。
5. build + push + 浏览器自验（按发布纪律）。
