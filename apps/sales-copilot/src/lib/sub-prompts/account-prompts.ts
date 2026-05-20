/**
 * Account sub-prompts: Log (create), Find (search/list), Update
 */
import type { SubPromptDef, SubPromptContext } from './index';

function accountLogSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户要创建一个新客户。从用户的话中提取以下字段（缺失的不填）：
- name: 客户名称
- industry: 行业
- region: 区域（华东/华北/华南/西南）
- tier: 客户等级（S/A/B/C）
- phone: 电话
- email: 邮箱
- address: 地址
- notes: 备注

输出 JSON: {"function": "draftAccount", "arguments": {...}}`
    : `The user wants to create a new account. Extract these fields (skip missing ones):
- name: account name
- industry: industry
- region: region
- tier: tier (S/A/B/C)
- phone, email, address, notes

Output JSON: {"function": "draftAccount", "arguments": {...}}`;
}

function accountFindSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户要查找客户。判断使用哪个函数：
- searchAccounts: 按名称搜索 → {"query": "关键字", "limit": 数字}
- getAccountDetails: 查看特定客户详情 → {"accountId": "ID"} 或 {"accountName": "名称"}
- getAccountsByRegion: 按区域筛选 → {"region": "华东/华北/华南/西南", "limit": 数字}
- getAccountsByTier: 按等级筛选 → {"tier": "S/A/B/C", "limit": 数字}
- getAccountsNeedingFollowUp: 需要跟进的客户 → {"days": 天数, "limit": 数字}

输出 JSON: {"function": "函数名", "arguments": {...}}`
    : `The user wants to find accounts. Choose the function:
- searchAccounts: search by name → {"query": "keyword", "limit": number}
- getAccountDetails: view specific account → {"accountId": "ID"} or {"accountName": "name"}
- getAccountsByRegion: filter by region → {"region": "value", "limit": number}
- getAccountsByTier: filter by tier → {"tier": "S/A/B/C", "limit": number}
- getAccountsNeedingFollowUp: accounts needing follow-up → {"days": number, "limit": number}

Output JSON: {"function": "functionName", "arguments": {...}}`;
}

function accountUpdateSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户要更新客户信息。提取客户标识（accountId 或 accountName）和要修改的字段。
可修改字段：name, industry, region, tier, phone, email, address, notes
输出 JSON: {"function": "updateAccount", "arguments": {"accountId": "...", ...修改字段}}`
    : `The user wants to update an account. Extract account identifier (accountId or accountName) and fields to change.
Updatable: name, industry, region, tier, phone, email, address, notes
Output JSON: {"function": "updateAccount", "arguments": {"accountId": "...", ...fields}}`;
}

function buildUserPrompt(ctx: SubPromptContext): string {
  let prompt = ctx.userMessage;
  if (ctx.frame.boundEntities?.account) {
    const a = ctx.frame.boundEntities.account;
    if (a.id) prompt += `\n[当前客户ID: ${a.id}]`;
    if (a.name) prompt += `\n[当前客户: ${a.name}]`;
  }
  return prompt;
}

export const accountPrompts: Record<string, SubPromptDef> = {
  Account_Log: { buildSystemPrompt: accountLogSystem, buildUserPrompt },
  Account_Find: { buildSystemPrompt: accountFindSystem, buildUserPrompt },
  Account_Update: { buildSystemPrompt: accountUpdateSystem, buildUserPrompt },
};
