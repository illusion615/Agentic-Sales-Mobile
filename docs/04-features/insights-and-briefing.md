# 业务洞察与简报

> 反向生成自当前代码（`src/pages/home.tsx`、`src/components/kpi-card.tsx`、
> `src/generated/services/business-insight-service.ts`、`briefing-service.ts`）。
> 描述「业务洞察」生成、铃铛未读提示，以及「简报」语音播报与跟随翻页。

## 1. 数据存储

- 洞察表 `crf5c_businessinsights`，应用类型 `BusinessInsight`，适配器
  `business-insight-service.ts`。关键字段：
  `title`、`summary`、`rationale`、`detailsjson`、`type`、`referenceType`、
  `displayorder`、`generatedon`、`isactive`、`validuntil`、`ownerid`。
- `generatedon` 记录生成时间，UI 用 `formatGeneratedAt()`（`kpi-card.tsx`）渲染「刚刚 / N 分钟前」。

## 2. 洞察生成（home.tsx · handleRefreshInsight）

洞察由 LLM 生成，入口为 home 的 `handleRefreshInsight`：

1. 汇集上下文数据，其中**高风险客户**列表 `clientsAtRiskList` 附带 `lastContactDays`
   等字段（`AtRiskClient` 接口），让模型有据可依。
2. 用资深销售教练系统提示词 `insightSystemPrompt`（中/英双语），要求输出遵循
   **What → Why → How** 结构（现象 → 原因 → 行动建议）。
3. 调 `generateVoiceSummary(..., 'text')` —— **必须用 `'text'` 模式**。

> **关键陷阱**：AI Builder 的 JSON 输出模式有 bug，会返回模板化的 schema 样板而非真实内容。
> 因此一律用 `'text'` 响应格式 + 客户端解析（含对 JSON 数组的健壮提取）。这是「重新生成洞察」
> 早期失效的根因。详见 [`../05-engineering/ai-builder-structured-output-schemas.md`](../05-engineering/ai-builder-structured-output-schemas.md)。

4. 重新生成 = **先删本人旧洞察、再批量建新**（所有者范围限定，见
   [`data-access-and-security.md`](data-access-and-security.md) §4.3）。

## 3. 已读 / 未读与铃铛角标

- home 维护 `readInsightIds`（`Set`），持久化在 localStorage 键
  `sales-copilot-read-insights`。
- `markInsightRead(id)` 标记已读；`unreadInsightCount` 驱动铃铛角标数字。
- `kpi-card.tsx` 通过 `onInsightViewed` 回调 + 浏览即标记的 effect，
  在洞察被实际查看时回写已读，角标随之递减。

## 4. 简报播报与语音跟随翻页（Insights Sheet）

播放控制集中在 **Insights 详情 Sheet**（`kpi-card.tsx`），而非旧的浮动播放器：

- 文本来源 `briefMeInsightTexts` 按卡片从 `businessInsights` 逐条重建。
- 朗读进度 `activeInsightIndex` 与 `setInsightsSheetIndex` 通过同步 effect 双向对齐，
  实现**语音读到哪张、Sheet 就翻到哪张**的逐卡跟随。
- 早期的「Brief Me」chip 与浮动播放器已移除，富播放控制并入 Insights Sheet
  （`kpi-card.tsx` + `home.tsx`）。

## 5. 简报表

- 简报数据走 `crf5c_briefings` / 适配器 `briefing-service.ts`，类型定义见
  `src/lib/briefing-types.ts`。
- 语音能力封装在 `src/lib/speech.ts`。

## 关键文件

- 生成与状态：[`apps/sales-copilot/src/pages/home.tsx`](../../apps/sales-copilot/src/pages/home.tsx)
- 洞察卡与播放：[`apps/sales-copilot/src/components/kpi-card.tsx`](../../apps/sales-copilot/src/components/kpi-card.tsx)
- 洞察适配器：[`apps/sales-copilot/src/generated/services/business-insight-service.ts`](../../apps/sales-copilot/src/generated/services/business-insight-service.ts)
- 简报适配器：[`apps/sales-copilot/src/generated/services/briefing-service.ts`](../../apps/sales-copilot/src/generated/services/briefing-service.ts)
