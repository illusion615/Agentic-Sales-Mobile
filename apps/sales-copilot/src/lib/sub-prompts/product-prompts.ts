/**
 * Product sub-prompts: Recommend + Knowledge → route to Copilot Studio
 */
import type { SubPromptDef, SubPromptContext } from './index';

function productSystem(ctx: SubPromptContext): string {
  return ctx.locale === 'zh-Hans'
    ? '用户在问产品相关问题（功能、规格、对比、推荐、FAQ）。把用户的问题原文提取出来，传给 Copilot Studio 知识库。如果用户用了代词（"这个产品"），根据上下文替换为具体产品名。输出 JSON: {"function": "queryCopilotStudio", "arguments": {"query": "用户问题（解析代词后）"}}'
    : 'The user is asking about products (features, specs, comparisons, recommendations, FAQ). Extract the question verbatim for Copilot Studio. If user used pronouns ("this product"), resolve to actual product name from context. Output JSON: {"function": "queryCopilotStudio", "arguments": {"query": "question with pronouns resolved"}}';
}

function buildUserPrompt(ctx: SubPromptContext): string {
  let prompt = ctx.userMessage;
  if (ctx.frame.boundEntities?.opportunity?.name) {
    prompt += `\n[当前商机: ${ctx.frame.boundEntities.opportunity.name}]`;
  }
  if (ctx.frame.boundEntities?.account?.name) {
    prompt += `\n[当前客户: ${ctx.frame.boundEntities.account.name}]`;
  }
  if (ctx.pageContext?.summary) {
    prompt += `\n[页面摘要: ${ctx.pageContext.summary}]`;
  }
  return prompt;
}

export const productPrompts: Record<string, SubPromptDef> = {
  Product_Recommend: { buildSystemPrompt: productSystem, buildUserPrompt },
  Product_Knowledge: { buildSystemPrompt: productSystem, buildUserPrompt },
  Product_Find: { buildSystemPrompt: productSystem, buildUserPrompt },
};
