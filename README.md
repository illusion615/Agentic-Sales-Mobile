# Agentic Sales Mobile · Sales Copilot Mobile

面向销售人员的移动端 CRM 智能体应用。基于 **Power Apps Code App + Dataverse**，
提供语音交互、Copilot 智能体对话，以及对客户 / 商机 / 活动的管理与洞察。

> 主应用代码位于 [`apps/sales-copilot`](apps/sales-copilot)。完整文档库见 [`docs/`](docs/index.html)。

---

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React + TypeScript + Vite + Tailwind |
| 宿主 | Power Apps Code App（`@microsoft/power-apps`） |
| 数据 | Microsoft Dataverse（`default.cds` 直连绑定，委派用户身份） |
| 智能体 | Frame · Plan · Execute 三段式 LLM 管线 + Power Automate Flow / AI Builder |
| 后端智能体 | Microsoft Copilot Studio（设计即代码，见 `copilot-studio/`） |

## 目录结构

```text
apps/sales-copilot/      # 主应用（React Code App）
copilot-studio/          # Copilot Studio 智能体设计（instructions / skills / eval）
docs/                    # 文档库（见 docs/index.html）
  01-overview/           # 产品概览
  02-architecture/       # 系统与智能体架构（设计 + 演进）
  04-features/           # 功能子系统设计
  05-engineering/        # 工程约定、集成契约、迁移
  06-reviews/            # 代码与架构评审
  07-operations/         # 已知问题与运维
```

## 快速开始（环境已配置好之后的日常构建）

> 首次部署到一个**全新环境**，请先看下面的「部署到你自己的环境」。本节是环境已就绪后的日常构建 / 推送命令。

```bash
cd apps/sales-copilot
nvm use                                   # Node.js 22 LTS（必须）
pnpm install
pnpm build                                # tsc -b && vite build
npx -y @microsoft/power-apps-cli@0.11.6 push   # 推送 dist 到 Power Apps
```

> 构建与推送纪律、Node 版本要求、依赖类型陷阱等，见
> [`.github/copilot-instructions.md`](.github/copilot-instructions.md)。

---

## 部署到你自己的环境（Deployment Guide）

本应用是 **Power Apps Code App**，运行时直连一个 **Dataverse** 环境，并依赖若干自定义表、一个 AI Builder 自定义 Prompt，以及一个 Copilot Studio 后端智能体（承载产品知识问答等场景）。部署到目标租户需先在环境中备齐这些后端对象，再推送前端构建产物。

> 仓库内 `power.config.json`、`playwright.config.ts` 等文件中的环境标识（org URL、environmentId、appId 等）为示例值，并非密钥，但须全部替换为目标环境的对应值，否则会连接或推送到错误的环境。完整清单见下文「环境标识替换清单」。

### 前置条件

| 类别 | 要求 |
| --- | --- |
| Power Platform | 一个含 **Dataverse** 的环境，且已启用 **Code Apps**（Power Apps Code App 预览特性）。 |
| AI Builder | 环境已启用 AI Builder（用于自定义 Prompt，**会消耗 AI Builder 额度**）。 |
| Copilot Studio | 产品知识问答等场景的后端智能体；不需这类场景时可改用前端 BYOM（自带模型）模式。 |
| 本地工具 | Node.js **22 LTS**（Node 23+ 存在 esbuild/fsevents 兼容问题）、`pnpm`、Power Apps CLI（`@microsoft/power-apps-cli`）。 |
| 权限 | 目标环境的 **System Administrator / System Customizer**（导入方案、注册 Code App 需要）。 |
| 解决方案文件 | 本应用的后端对象（自定义表等）由一个 **Dataverse 解决方案 `.zip`** 提供，**不在本仓库内**，需向应用维护者单独获取。 |

> 本指南只覆盖 **Code App（前端）的部署**。后端 Dataverse 对象通过导入解决方案完成，本指南不涉及如何制作 / 导出该方案。

### 步骤 1 — 导入解决方案（准备后端）

在目标环境导入你持有的解决方案 `.zip`：`make.powerapps.com → Solutions → Import solution`，按向导完成（如方案中含 Copilot Studio 连接等组件，会提示你建立 / 选择对应连接）。

导入后，该方案会在目标环境提供应用所需的自定义表（`crf5c_` 前缀）。**务必使用解决方案导入而非手工建表**：生成层代码（`src/generated/services/`）按物理逻辑名（如 `crf5c_opportunity1`）寻址，手工建表会得到不同的发布者前缀（如 `new_`），导致所有生成层服务失配、需要重新生成。

应用引用的数据源（供核对方案是否齐全，列定义以 `apps/sales-copilot/.power/schemas/dataverse/*.Schema.json` 为准）：

| 数据源 key | 逻辑名 | 类型 | 用途 |
| --- | --- | --- | --- |
| `opportunities` | `crf5c_opportunity1` | 自定义 | 商机（**非**原生 opportunity；需开启「启用活动 / Enable activities」） |
| `businessinsights` | `crf5c_businessinsight` | 自定义 | 业务洞察 |
| `briefings` | `crf5c_briefing` | 自定义 | 每日简报 |
| `copilotconversations` | `crf5c_copilotconversation` | 自定义 | 会话记录 |
| `products` | `crf5c_product` | 自定义 | 产品 |
| `settings` | `crf5c_setting` | 自定义 | 运行时配置（见步骤 3 / 4） |
| `aisummaries` | `crf5c_aisummary` | 自定义 | AI 摘要 |
| `agentlogs` | `crf5c_agentlog` | 自定义 | 智能体日志 |
| `account` / `contact` / `appointment` / `phonecall` / `email` / `systemuser` / `annotation` / `activitymimeattachment` / `activityparty` / `msdyn_aimodel` | 同名 | 原生 | 客户 / 联系人 / 活动 / 用户 / 附件 / 参与方 / AI 模型 |

> 原生表无需创建，确保运行账号对其有读写权限即可。

### 步骤 2 — 确认 AI Builder 自定义 Prompt

应用的 LLM 调用走一个 AI Builder 自定义 Prompt。若它已随解决方案导入，确认其已**发布**且账号有读取权限即可；若未包含在方案内，则在目标环境手工创建：

- **名称**：必须叫 `SalesCopilotCorePrompt`（应用在运行时按这个名字到 `msdyn_aimodels` 表解析其 GUID，见 [`src/services/prompt-resolver.ts`](apps/sales-copilot/src/services/prompt-resolver.ts)）。
- **输入参数**：一个文本参数 `prompt text`（物理名 `prompt_20text`）。
- **输出**：**Text**（纯文本；不要用 AI Builder 的 JSON 结构化输出，本项目客户端自行做 Zod 解析）。
- 创建后**发布**，并确保运行账号有读取权限。

> Prompt 的 GUID 在不同环境各不相同；应用按显示名称在运行时解析对应 GUID 并缓存，无需修改代码。若 AI 回复异常，应用设置页会提示确认该 Prompt 是否已导入并发布。

### 步骤 3 — 配置 Copilot Studio 后端智能体

Copilot Studio 后端承载产品知识问答等场景，这些场景下必须配置。仅当部署不涉及该类场景时，可改用前端 BYOM 模式（见本步骤末尾）。

1. 智能体若随解决方案导入并发布则直接复用；否则按 [`copilot-studio/`](copilot-studio/) 的设计（`instructions.md` + `skills/`）在 Copilot Studio 创建并发布。
2. 在 `crf5c_setting` 表新增一行：`settingKey = copilot_studio_agent_name`，`settingValue = <你的智能体 schema 名>`。
3. 在 `power.config.json` 的 `connectionReferences` 里，把 Copilot Studio 连接换成你自己环境的连接。

> 在不涉及产品知识问答等场景、未配置 Copilot Studio 时，应用使用前端**本地轻量级智能体（BYOM）**模式，在应用「设置」页填入 LLM provider / endpoint / API Key（这些为按用户存储的运行时配置，不入库、不进仓库）。

### 步骤 4 — 把应用指向你的环境（替换环境标识）

编辑 [`apps/sales-copilot/power.config.json`](apps/sales-copilot/power.config.json)，替换为你自己的值：

| 字段 | 替换为 |
| --- | --- |
| `databaseReferences.default.cds.instanceUrl` | 你的 Dataverse 组织 URL（`https://<yourorg>.crm.dynamics.com/`） |
| `environmentId` | 你的环境 ID |
| `appId` | 留空 / 由首次 `init`/`push` 生成，或填你已注册的 Code App ID |
| `connectionReferences.*` | 你自己的连接引用（如使用 Copilot Studio） |
| `tags.projectId` | 你自己的，或留空 |

> 另一种方式：在目标环境对空目录运行 Code App 初始化（`init`）重新生成 `power.config.json`，再逐表执行 `add-data-source`。注意：**`pac code add-data-source` 对 Dataverse 有 bug**，请用 npm 版 CLI，例如：
> ```bash
> npx -y @microsoft/power-apps-cli@0.11.6 add-data-source \
>   --api-id dataverse --resource-name <logicalName> \
>   --org-url https://<yourorg>.crm.dynamics.com/
> ```

E2E 测试的目标地址不要硬编码——通过环境变量传入（[`playwright.config.ts`](apps/sales-copilot/playwright.config.ts) 已支持）：

```bash
export POWER_APPS_URL="https://apps.powerapps.com/play/e/<env>/app/<appId>?tenantId=<tenant>"
```

### 步骤 5 — 构建并推送

```bash
cd apps/sales-copilot
nvm use            # Node.js 22 LTS（Node 23+ 有 esbuild/fsevents 问题）
pnpm install
pnpm build         # tsc -b && vite build（首次冷编译耗时较长，属正常现象）
npx -y @microsoft/power-apps-cli@0.11.6 push
```

> `push` **不会**触发构建——务必先 `pnpm build` 再 push，否则推上去的是旧的 `dist/`。

### 步骤 6 — 首次运行配置与验证

1. 在 Power Apps 中打开应用。
2. 进入「设置」页，选择智能体模式：**Copilot Studio**（需步骤 3）或**本地 BYOM**（填入你的 LLM 配置）。
3. 验证清单：①应用正常加载 → ②发送一条消息能得到回复 → ③浏览器控制台无报错 → ④客户 / 商机 / 活动数据能正常读写。

### 环境标识替换清单（速查）

| 位置 | 内容 | 怎么处理 |
| --- | --- | --- |
| `apps/sales-copilot/power.config.json` | `instanceUrl` / `environmentId` / `appId` / `connectionReferences` / `tags.projectId` | 改成你自己的（步骤 4） |
| `apps/sales-copilot/playwright.config.ts`、`e2e/auth.setup.ts` | 默认 play URL（含 tenantId/hint） | 用 `POWER_APPS_URL` 环境变量覆盖，勿提交真实租户地址 |
| AI Builder Prompt | 名称 `SalesCopilotCorePrompt` | 在你环境创建同名 Prompt（步骤 2），GUID 自动解析 |
| `crf5c_setting` 表 | `copilot_studio_agent_name` | 填你自己的智能体 schema 名（步骤 3） |
| 应用「设置」页 | LLM provider / endpoint / API Key | 按用户运行时填写，不入库 |

## 文档入口

文档库总入口：[`docs/index.html`](docs/index.html)（在浏览器中打开可分类浏览全部文档）。

### 01 · 产品概览
- 产品概览：[`docs/01-overview/product-overview.md`](docs/01-overview/product-overview.md)

### 02 · 架构
- 智能体架构（**单一来源**）：[`docs/02-architecture/agent-architecture-2026-05-17.html`](docs/02-architecture/agent-architecture-2026-05-17.html)
- 多轮会话状态设计（v1.1）：[`docs/02-architecture/conversation-state-architecture-2026-06-09.html`](docs/02-architecture/conversation-state-architecture-2026-06-09.html)
- 架构演进摘要：[`docs/02-architecture/architecture-history.html`](docs/02-architecture/architecture-history.html)
- 编排历史评审稿（archived）：[`docs/02-architecture/history/agent-orchestration-2026-05-16.html`](docs/02-architecture/history/agent-orchestration-2026-05-16.html)

### 03 · 数据模型（单一来源）
> 数据模型不再保留独立快照文档。权威来源有两个，二者须保持一致：
> - 机器可读 / 运行时真相：[`apps/sales-copilot/power.config.json`](apps/sales-copilot/power.config.json)（18 个 Dataverse 数据源）
> - 人读说明（客户视角）：Study-Room「Agentic Sales Mobile 数据模型」文章

### 04 · 功能子系统
- 数据访问与安全：[`docs/04-features/data-access-and-security.md`](docs/04-features/data-access-and-security.md)
- 洞察与简报：[`docs/04-features/insights-and-briefing.md`](docs/04-features/insights-and-briefing.md)
- 设置与个性化：[`docs/04-features/settings-and-personalization.md`](docs/04-features/settings-and-personalization.md)
- 时态感知活动记录：[`docs/04-features/tense-aware-activity-2026-05-17.html`](docs/04-features/tense-aware-activity-2026-05-17.html)

### 05 · 工程
- AI Builder 结构化输出 Schema：[`docs/05-engineering/ai-builder-structured-output-schemas.md`](docs/05-engineering/ai-builder-structured-output-schemas.md)
- Code App 迁移记录：[`docs/05-engineering/code-app-migration-2026-05-20.html`](docs/05-engineering/code-app-migration-2026-05-20.html)
- 构建 / 推送纪律与依赖陷阱：[`.github/copilot-instructions.md`](.github/copilot-instructions.md)

### 06 · 评审
- 架构评审（2026-05-30）：[`docs/06-reviews/architecture-review-2026-05-30.html`](docs/06-reviews/architecture-review-2026-05-30.html)
- 代码评审（2026-05-16）：[`docs/06-reviews/code-review-2026-05-16.html`](docs/06-reviews/code-review-2026-05-16.html)
- 代码评审（2026-05-11）：[`docs/06-reviews/code-review-2026-05-11.md`](docs/06-reviews/code-review-2026-05-11.md)
- 评审方法与门槛标准：[`.github/instructions/code-review.instructions.md`](.github/instructions/code-review.instructions.md)

### 07 · 运维
- PAC CLI 误删 Logic Flow 问题：[`docs/07-operations/pac-cli-deletes-logicflows.md`](docs/07-operations/pac-cli-deletes-logicflows.md)

### Copilot Studio 后端智能体
- 智能体说明：[`copilot-studio/instructions.md`](copilot-studio/instructions.md)
- 技能定义：[`copilot-studio/skills/`](copilot-studio/skills/)（记录活动 / 客户联系人 / 商机 / 规划推荐 / 查询报表）
- 测试脚本：[`copilot-studio/test-script.md`](copilot-studio/test-script.md)


## 文档维护规则

1. 新文档按类型放入对应的 `docs/NN-*/` 目录，不要散落在仓库根目录。
2. 智能体架构判断优先更新 `02-architecture/` 下的设计文档，而不是新开孤立文件。
3. 评审报告进 `06-reviews/`，迁移与工程约定进 `05-engineering/`，已知问题进 `07-operations/`。
4. 代码与设计文档应保持双向同步：实现偏离设计时更新文档，更新文档时确认代码一致。

## 许可

本项目以 **MIT License** 授权，详见 [`LICENSE`](LICENSE)。
