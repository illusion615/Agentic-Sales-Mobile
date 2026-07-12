# Agentic Sales Mobile · Sales Copilot Mobile

面向销售人员的移动端 CRM 智能体应用。基于 **Power Apps Code App + Dataverse**，
提供语音交互、Copilot 智能体对话，以及对客户 / 商机 / 活动的管理与洞察。

> 主应用代码位于 [`apps/sales-copilot`](apps/sales-copilot)。完整文档库见 [`docs/`](docs/index.html)。

---

## 功能摘要

- **客户与联系人管理**：查看客户、联系人、活动记录与附件，围绕销售日常工作做移动端操作。
- **商机与销售活动管理**：管理商机、电话、邮件、会议与拜访记录，支持从对话中触发常见 CRM 操作。
- **AI 销售助手**：用自然语言询问客户、商机、活动、产品与销售计划，助手会拆解意图并执行相应任务。
- **市场洞察与销售洞察**：为客户生成市场动态、风险、销售建议与下一步行动项，引用来源可追溯。
- **每日简报与朗读**：汇总当天重点客户、商机和待办，并支持自然语音朗读。
- **语音输入与语音播报**：支持在移动端用语音提问、听写和朗读，即使设备缺少本地语音能力也可通过云端语音能力补齐。
- **离线与弱网韧性**：网络不稳定时仍可打开应用查看最近数据；离线记录拜访会在恢复联网后同步。
- **多语言与个性化**：支持中文、英文、德语、法语、西班牙语，并提供语音、布局、反馈动画等个性化设置。

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
| Release history（功能层面） | [`docs/07-operations/release-history.md`](docs/07-operations/release-history.md) |
| 构建与推送纪律、依赖陷阱 | [`.github/copilot-instructions.md`](.github/copilot-instructions.md) |
| Copilot Studio 后端智能体设计 | [`copilot-studio/`](copilot-studio/) |

> **文档分工**：Study-Room = 对外发布的最终文档（不含设计过程 / 演变）；`docs/` = 开发相关的设计、中间态与运维文档，保持单一真相；README 只做说明与指引。数据模型运行时真相以 [`power.config.json`](apps/sales-copilot/power.config.json) 为准。

## 许可

本项目以 **MIT License** 授权，详见 [`LICENSE`](LICENSE)。
