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

## 快速开始

```bash
cd apps/sales-copilot
nvm use                                   # Node.js 22 LTS（必须）
pnpm install
pnpm build                                # tsc -b && vite build
npx -y @microsoft/power-apps-cli@0.11.6 push   # 推送 dist 到 Power Apps
```

> 构建与推送纪律、Node 版本要求、依赖类型陷阱等，见
> [`.github/copilot-instructions.md`](.github/copilot-instructions.md)。

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
