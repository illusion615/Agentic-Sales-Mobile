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

## 快速开始（环境已就绪后的日常构建）

```bash
cd apps/sales-copilot
nvm use                                   # Node.js 22 LTS（必须）
pnpm install
pnpm build                                # tsc -b && vite build
npx -y @microsoft/power-apps-cli@0.11.6 push   # 推送 dist 到 Power Apps
```

> 首次部署到全新环境：见 [`docs/07-operations/app-deployment.md`](docs/07-operations/app-deployment.md)。
> 构建 / 推送纪律、Node 版本、依赖类型陷阱：见 [`.github/copilot-instructions.md`](.github/copilot-instructions.md)。

## 文档

| 类型 | 位置 |
| --- | --- |
| **对外公开知识**（产品 / 架构 / 功能 / 数据模型 / 语音）——最终形态、对外发布 | **Study-Room 知识库**（`agentic-crm` 主题） |
| **开发文档**（设计 / 中间态 / 演进 / 工程 / 评审 / 运维 / 部署）——仓内唯一真相 | [`docs/`](docs/index.html) |
| 构建与推送纪律、依赖陷阱 | [`.github/copilot-instructions.md`](.github/copilot-instructions.md) |
| Copilot Studio 后端智能体设计 | [`copilot-studio/`](copilot-studio/) |

> **文档分工**：Study-Room = 对外发布的最终文档（不含设计过程 / 演变）；`docs/` = 开发相关的设计、中间态与运维文档，保持单一真相；README 只做说明与指引。数据模型运行时真相以 [`power.config.json`](apps/sales-copilot/power.config.json) 为准。

## 许可

本项目以 **MIT License** 授权，详见 [`LICENSE`](LICENSE)。
