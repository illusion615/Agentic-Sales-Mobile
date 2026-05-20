/**
 * None sub-prompts: Chat + Knowledge (external)
 */
import type { SubPromptDef, SubPromptContext } from './index';

function chatSystem(_ctx: SubPromptContext): string {
  return _ctx.locale === 'zh-Hans'
    ? '你是一个友好的销售助手。用户在闲聊或打招呼。用简短自然的方式回应。输出 JSON: {"function": null, "arguments": {}, "directResponse": "你的回复"}'
    : 'You are a friendly sales assistant. The user is chatting or greeting. Respond briefly and naturally. Output JSON: {"function": null, "arguments": {}, "directResponse": "your reply"}';
}

function knowledgeSystem(_ctx: SubPromptContext): string {
  return _ctx.locale === 'zh-Hans'
    ? '用户在问非产品的外部知识（行业趋势、法规、竞品等）。提取用户的问题原文。输出 JSON: {"function": "externalKnowledgeQuery", "arguments": {"query": "用户问题原文"}}'
    : 'The user is asking external knowledge (industry trends, regulations, competitors). Extract the original question. Output JSON: {"function": "externalKnowledgeQuery", "arguments": {"query": "user question verbatim"}}';
}

function buildUserPrompt(ctx: SubPromptContext): string {
  return ctx.userMessage;
}

export const nonePrompts: Record<string, SubPromptDef> = {
  None_Chat: { buildSystemPrompt: chatSystem, buildUserPrompt },
  None_Knowledge: { buildSystemPrompt: knowledgeSystem, buildUserPrompt },
};
