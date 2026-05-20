/**
 * Mixed sub-prompts: Multi-intent with DAG execution support
 *
 * When Frame Shadow classifies as Mixed, it means the user's message
 * contains multiple intents across different objects. This sub-prompt
 * outputs a DAG plan with sequenced steps and dependency references.
 */
import type { SubPromptDef, SubPromptContext } from './index';

function mixedLogSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户在一句话里提到了多个操作（跨客户/商机/活动/联系人）。你需要把它们拆分成有序的执行步骤。

**输出格式：DAG 执行计划**

每个步骤有：
- seq: 执行顺序（数字）。相同 seq 的步骤可以并行
- outputRef: 这个步骤的输出引用名（如 "$opp"），后续步骤可以用 "$opp.id" 引用
- dependsOn: 这个步骤依赖哪些引用（如 ["$opp"]）
- function: 要调用的函数
- arguments: 参数。可以用 "$ref.field" 引用前置步骤的输出

**依赖规则：**
- 如果用户要创建商机 + 活动，活动通常依赖商机（有 opportunity lookup 字段）
- 商机 seq=1，活动 seq=2，活动的 opportunityId = "$opp.id"
- 如果用户要创建客户 + 联系人，联系人依赖客户
- 相互独立的操作可以有相同的 seq

**可用函数：**
- draftOpportunity: 创建商机 (name, accountName, amount, stage, confidence)
- draftActivity: 创建活动 (title, type, accountName, scheduledDate, temporalMode, opportunityId, opportunityName)
- draftAccount: 创建客户 (name, industry, region, tier)
- draftContact: 创建联系人 (fullName, accountName, title)
- updateOpportunity / updateActivity / updateAccount / updateContact: 更新记录

**temporalMode 规则：**
- 已发生的事 → temporalMode = "completed"
- 将要发生的事 → temporalMode = "planned"

输出 JSON:
{
  "steps": [
    { "seq": 1, "outputRef": "$opp", "function": "draftOpportunity", "arguments": {...} },
    { "seq": 2, "dependsOn": ["$opp"], "function": "draftActivity", "arguments": {"opportunityId": "$opp.id", ...} }
  ]
}`
    : `The user mentioned multiple operations across objects in one sentence. Split them into ordered execution steps.

**Output format: DAG execution plan**

Each step has:
- seq: execution order (number). Same seq = parallel execution
- outputRef: output reference name (e.g. "$opp"), later steps use "$opp.id"
- dependsOn: which references this step depends on (e.g. ["$opp"])
- function: function to call
- arguments: params. Can use "$ref.field" to reference prior step outputs

**Dependency rules:**
- Opportunity + Activity → Activity depends on Opportunity (has opportunity lookup)
- Opportunity seq=1, Activity seq=2, Activity's opportunityId = "$opp.id"
- Account + Contact → Contact depends on Account
- Independent operations can share the same seq

**Available functions:**
- draftOpportunity: create opportunity (name, accountName, amount, stage, confidence)
- draftActivity: create activity (title, type, accountName, scheduledDate, temporalMode, opportunityId, opportunityName)
- draftAccount: create account (name, industry, region, tier)
- draftContact: create contact (fullName, accountName, title)
- updateOpportunity / updateActivity / updateAccount / updateContact: update records

**temporalMode rules:**
- Past event → temporalMode = "completed"
- Future event → temporalMode = "planned"

Output JSON:
{
  "steps": [
    { "seq": 1, "outputRef": "$opp", "function": "draftOpportunity", "arguments": {...} },
    { "seq": 2, "dependsOn": ["$opp"], "function": "draftActivity", "arguments": {"opportunityId": "$opp.id", ...} }
  ]
}`;
}

function mixedFindSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? `用户要查看综合销售数据。输出 JSON: {"function": "getSalesSummary", "arguments": {}}`
    : `The user wants a sales summary. Output JSON: {"function": "getSalesSummary", "arguments": {}}`;
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
  if (ctx.frame.explicitNames?.length) {
    prompt += `\n[用户提到的实体: ${ctx.frame.explicitNames.map(e => `${e.kind}:${e.text}`).join(', ')}]`;
  }
  return prompt;
}

export const mixedPrompts: Record<string, SubPromptDef> = {
  Mixed_Log: { buildSystemPrompt: mixedLogSystem, buildUserPrompt },
  Mixed_Plan: { buildSystemPrompt: mixedLogSystem, buildUserPrompt }, // same DAG logic
  Mixed_Find: { buildSystemPrompt: mixedFindSystem, buildUserPrompt },
};
