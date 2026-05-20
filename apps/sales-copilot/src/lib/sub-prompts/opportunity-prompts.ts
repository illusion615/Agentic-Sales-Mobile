/**
 * Opportunity sub-prompts: Log (create), Find, Update
 */
import type { SubPromptDef, SubPromptContext } from './index';

function opportunityLogSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户要创建一个新商机。提取以下字段：
- name: 商机名称
- accountName: 所属客户
- amount: 金额（自动转换：200k→200000, 50万→500000）
- stage: 阶段（prospecting/qualification/proposal/negotiation/won/lost）
- confidence: 赢率（0-100）
- expectedCloseDate: 预计关闭日期
- lastAction: 最近行动
- notes: 备注

输出 JSON: {"function": "draftOpportunity", "arguments": {...}}`
    : `The user wants to create an opportunity. Extract:
- name: opportunity name
- accountName: parent account
- amount: amount (auto-convert: 200k→200000, 50万→500000)
- stage: stage (prospecting/qualification/proposal/negotiation/won/lost)
- confidence: win probability (0-100)
- expectedCloseDate: expected close date
- lastAction: recent action
- notes: notes

Output JSON: {"function": "draftOpportunity", "arguments": {...}}`;
}

function opportunityFindSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户要查找商机。选择函数：
- getMyOpportunities: 我的所有商机 → {"limit": 数字}
- getTopOpportunities: 金额最大的商机 → {"limit": 数字}
- getOpportunitiesByAccount: 某客户下的商机 → {"accountId": "ID", "limit": 数字}
- getOpportunitiesClosingSoon: 即将关闭的商机 → {"days": 天数, "limit": 数字}

输出 JSON: {"function": "函数名", "arguments": {...}}`
    : `The user wants to find opportunities. Choose:
- getMyOpportunities: all my opportunities → {"limit": number}
- getTopOpportunities: highest value → {"limit": number}
- getOpportunitiesByAccount: under an account → {"accountId": "ID", "limit": number}
- getOpportunitiesClosingSoon: closing soon → {"days": number, "limit": number}

Output JSON: {"function": "functionName", "arguments": {...}}`;
}

function opportunityUpdateSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户要更新商机。提取商机标识和要修改的字段。
可修改：name, amount, stage, confidence, expectedCloseDate, lastAction, notes
特殊：stage 设为 "won" 时自动填充 closedon 为今天。
输出 JSON: {"function": "updateOpportunity", "arguments": {"opportunityId": "...", ...}}`
    : `The user wants to update an opportunity. Extract identifier and fields.
Updatable: name, amount, stage, confidence, expectedCloseDate, lastAction, notes
Special: when stage is "won", auto-set closedon to today.
Output JSON: {"function": "updateOpportunity", "arguments": {"opportunityId": "...", ...}}`;
}

function buildUserPrompt(ctx: SubPromptContext): string {
  let prompt = ctx.userMessage;
  if (ctx.frame.boundEntities?.opportunity) {
    const o = ctx.frame.boundEntities.opportunity;
    if (o.id) prompt += `\n[当前商机ID: ${o.id}]`;
    if (o.name) prompt += `\n[当前商机: ${o.name}]`;
  }
  if (ctx.frame.boundEntities?.account) {
    const a = ctx.frame.boundEntities.account;
    if (a.id) prompt += `\n[当前客户ID: ${a.id}]`;
    if (a.name) prompt += `\n[当前客户: ${a.name}]`;
  }
  return prompt;
}

export const opportunityPrompts: Record<string, SubPromptDef> = {
  Opportunity_Log: { buildSystemPrompt: opportunityLogSystem, buildUserPrompt },
  Opportunity_Find: { buildSystemPrompt: opportunityFindSystem, buildUserPrompt },
  Opportunity_Update: { buildSystemPrompt: opportunityUpdateSystem, buildUserPrompt },
};
