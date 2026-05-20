/**
 * Activity sub-prompts: Log, Plan, Find, Update, Report
 * This is the most complex domain — handles temporal mode, multi-intent
 * opportunity discovery, and daily report generation.
 */
import type { SubPromptDef, SubPromptContext } from './index';

function activityLogSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户在记录一次**已经发生**的销售活动。提取以下字段：
- title: 活动标题（简要描述做了什么）
- type: 类型（visit/call/meeting/email/other）
- accountName: 客户名称
- contactName: 联系人
- scheduledDate: 日期（默认今天）
- result: 结果/成果
- nextStep: 下一步计划
- opportunityName: 关联商机（如果提到）
- notes: 详细备注

**关键规则：temporalMode**
- 用户描述的是**过去**的事 → temporalMode = "completed"
- 表单将以已完成状态打开

**商机信号自动发现**
如果用户提到了金额、阶段、项目进展等商机相关信息，即使用户没有明确说"创建商机"，也要在 _signals 字段中标记。
- _signals: ["amount_mentioned", "stage_implied", "competition_mentioned", ...] 中的匹配项
- _confidence: 商机存在的置信度(0-100)

输出 JSON: {"function": "draftActivity", "arguments": {...}}`
    : `The user is recording a sales activity that **already happened**. Extract:
- title: activity title (brief description)
- type: type (visit/call/meeting/email/other)
- accountName: account name
- contactName: contact name
- scheduledDate: date (default today)
- result: outcome
- nextStep: next steps
- opportunityName: linked opportunity (if mentioned)
- notes: detailed notes

**Key rule: temporalMode**
- User describes a **past** event → temporalMode = "completed"
- Form opens in completed state

**Opportunity signal discovery**
If user mentions amounts, stages, project progress, etc., flag in _signals even if they didn't explicitly say "create opportunity".
- _signals: matching items from ["amount_mentioned", "stage_implied", "competition_mentioned", ...]
- _confidence: opportunity existence confidence (0-100)

Output JSON: {"function": "draftActivity", "arguments": {...}}`;
}

function activityPlanSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户要安排一个**未来的**销售活动。提取以下字段：
- title: 活动标题
- type: 类型（visit/call/meeting/email/other）
- accountName: 客户名称
- contactName: 联系人
- scheduledDate: 计划日期（"下周三"→计算具体日期）
- opportunityName: 关联商机
- notes: 备注

**关键规则：temporalMode**
- 用户安排的是**未来**的事 → temporalMode = "planned"
- 表单将以计划状态打开

输出 JSON: {"function": "draftActivity", "arguments": {...}}`
    : `The user wants to schedule a **future** sales activity. Extract:
- title, type, accountName, contactName
- scheduledDate: planned date ("next Wednesday" → compute actual date)
- opportunityName: linked opportunity
- notes

**Key rule: temporalMode**
- User is scheduling a **future** event → temporalMode = "planned"
- Form opens in planned state

Output JSON: {"function": "draftActivity", "arguments": {...}}`;
}

function activityFindSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户要查找活动。选择函数：
- getTodayActivities: 今天的活动 → {"limit": 数字}
- getUpcomingActivities: 接下来的活动 → {"days": 天数, "limit": 数字}
- getActivitiesByAccount: 某客户的活动 → {"accountId": "ID", "limit": 数字}

输出 JSON: {"function": "函数名", "arguments": {...}}`
    : `The user wants to find activities. Choose:
- getTodayActivities: today's activities → {"limit": number}
- getUpcomingActivities: upcoming activities → {"days": number, "limit": number}
- getActivitiesByAccount: activities for an account → {"accountId": "ID", "limit": number}

Output JSON: {"function": "functionName", "arguments": {...}}`;
}

function activityUpdateSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户要更新活动。提取活动标识和要修改的字段。
可修改：title, type, scheduledDate, result, nextStep, notes, status(draft/confirmed/completed/cancelled)
特殊：accountName/accountId, contactName, opportunityName/opportunityId 可关联
输出 JSON: {"function": "updateActivity", "arguments": {"activityId": "...", ...}}`
    : `The user wants to update an activity. Extract identifier and fields.
Updatable: title, type, scheduledDate, result, nextStep, notes, status
Linkable: accountName/accountId, contactName, opportunityName/opportunityId
Output JSON: {"function": "updateActivity", "arguments": {"activityId": "...", ...}}`;
}

function activityReportSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户要生成日报/简报。根据页面数据生成结构化的销售简报。
输出 JSON: {"function": null, "arguments": {}, "directResponse": "生成的简报内容（Markdown格式）"}`
    : `The user wants a daily report/briefing. Generate a structured sales briefing from page data.
Output JSON: {"function": null, "arguments": {}, "directResponse": "briefing content (Markdown format)"}`;
}

function buildUserPrompt(ctx: SubPromptContext): string {
  let prompt = ctx.userMessage;
  if (ctx.frame.boundEntities?.account) {
    const a = ctx.frame.boundEntities.account;
    if (a.id) prompt += `\n[当前客户ID: ${a.id}]`;
    if (a.name) prompt += `\n[当前客户: ${a.name}]`;
  }
  if (ctx.frame.boundEntities?.opportunity) {
    const o = ctx.frame.boundEntities.opportunity;
    if (o.id) prompt += `\n[当前商机ID: ${o.id}]`;
    if (o.name) prompt += `\n[当前商机: ${o.name}]`;
  }
  if (ctx.frame.boundEntities?.contact) {
    const c = ctx.frame.boundEntities.contact;
    if (c.id) prompt += `\n[当前联系人ID: ${c.id}]`;
    if (c.name) prompt += `\n[当前联系人: ${c.name}]`;
  }
  if (ctx.pageContext?.summary) {
    prompt += `\n[页面摘要: ${ctx.pageContext.summary}]`;
  }
  return prompt;
}

export const activityPrompts: Record<string, SubPromptDef> = {
  Activity_Log: { buildSystemPrompt: activityLogSystem, buildUserPrompt },
  Activity_Plan: { buildSystemPrompt: activityPlanSystem, buildUserPrompt },
  Activity_Find: { buildSystemPrompt: activityFindSystem, buildUserPrompt },
  Activity_Update: { buildSystemPrompt: activityUpdateSystem, buildUserPrompt },
  Activity_Report: { buildSystemPrompt: activityReportSystem, buildUserPrompt },
};
