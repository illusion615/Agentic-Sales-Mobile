/**
 * Contact sub-prompts: Log (create), Find, Update
 */
import type { SubPromptDef, SubPromptContext } from './index';

function contactLogSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户要创建一个新联系人。提取以下字段：
- fullName: 姓名
- accountName: 所属客户（如果用户提到或页面已绑定）
- title: 职位/头衔
- department: 部门
- phone: 电话
- email: 邮箱
- notes: 备注

输出 JSON: {"function": "draftContact", "arguments": {...}}`
    : `The user wants to create a contact. Extract:
- fullName: full name
- accountName: parent account (if mentioned or bound by page)
- title: job title
- department, phone, email, notes

Output JSON: {"function": "draftContact", "arguments": {...}}`;
}

function contactFindSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户要查找联系人。选择函数：
- getContactsByAccount: 查看某客户下的联系人 → {"accountId": "ID", "limit": 数字}
- fuzzyMatchContact: 按名字模糊查找 → {"query": "名字", "context": "上下文"}

输出 JSON: {"function": "函数名", "arguments": {...}}`
    : `The user wants to find contacts. Choose:
- getContactsByAccount: contacts under an account → {"accountId": "ID", "limit": number}
- fuzzyMatchContact: fuzzy match by name → {"query": "name", "context": "context"}

Output JSON: {"function": "functionName", "arguments": {...}}`;
}

function contactUpdateSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户要更新联系人信息。提取联系人标识和要修改的字段。
可修改：fullName, title, department, phone, email, notes
输出 JSON: {"function": "updateContact", "arguments": {"contactId": "...", ...}}`
    : `The user wants to update a contact. Extract identifier and fields.
Updatable: fullName, title, department, phone, email, notes
Output JSON: {"function": "updateContact", "arguments": {"contactId": "...", ...}}`;
}

function buildUserPrompt(ctx: SubPromptContext): string {
  let prompt = ctx.userMessage;
  if (ctx.frame.boundEntities?.account) {
    const a = ctx.frame.boundEntities.account;
    if (a.id) prompt += `\n[当前客户ID: ${a.id}]`;
    if (a.name) prompt += `\n[当前客户: ${a.name}]`;
  }
  if (ctx.frame.boundEntities?.contact) {
    const c = ctx.frame.boundEntities.contact;
    if (c.id) prompt += `\n[当前联系人ID: ${c.id}]`;
    if (c.name) prompt += `\n[当前联系人: ${c.name}]`;
  }
  return prompt;
}

export const contactPrompts: Record<string, SubPromptDef> = {
  Contact_Log: { buildSystemPrompt: contactLogSystem, buildUserPrompt },
  Contact_Find: { buildSystemPrompt: contactFindSystem, buildUserPrompt },
  Contact_Update: { buildSystemPrompt: contactUpdateSystem, buildUserPrompt },
};
