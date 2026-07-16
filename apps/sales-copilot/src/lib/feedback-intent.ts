import type { FeedbackType } from '@/generated/models/app-feedback-model';
import type { IntentResult } from '@/lib/copilot-agent-types';

const EXPLICIT_PREFIX = /^(?:bug|feature\s*request|enhancement|feedback|缺陷|问题反馈|功能建议|改进建议|需求建议|产品建议)\s*[:：-]\s*/i;
const APP_TARGET = /(?:这个|本|当前)?(?:app|应用|软件|系统|sales\s*copilot|copilot)/i;
const BUG_SIGNAL = /(?:bug|缺陷|报错|崩溃|闪退|打不开|不能用|无法|丢失|不显示|空白|错误)/i;
const ENHANCEMENT_SIGNAL = /(?:feature\s*request|enhancement|功能建议|改进建议|建议增加|希望增加|希望支持|能否增加|可以加|最好能)/i;

export interface FeedbackDraftSeed {
  feedbackType: FeedbackType;
  title: string;
  description: string;
  expectedOutcome: string;
  reproductionSteps: string;
}

function stripPrefix(text: string): string {
  return text.replace(EXPLICIT_PREFIX, '').trim();
}

function firstSentence(text: string): string {
  const cleaned = stripPrefix(text).replace(/\s+/g, ' ').trim();
  const first = cleaned.split(/(?<=[。！？.!?])\s+/)[0] || cleaned;
  return first.slice(0, 200);
}

/**
 * Deterministic product-feedback gate ahead of the sales Frame.
 *
 * High precision is intentional: an explicit feedback prefix always qualifies;
 * otherwise the message must name the app/system AND carry a bug/improvement
 * signal. Customer/sales feedback therefore remains in the CRM pipeline.
 */
export function detectAppFeedback(text: string): FeedbackDraftSeed | null {
  const input = text.trim();
  if (!input) return null;

  const explicit = EXPLICIT_PREFIX.test(input);
  const targeted = APP_TARGET.test(input) && (BUG_SIGNAL.test(input) || ENHANCEMENT_SIGNAL.test(input));
  if (!explicit && !targeted) return null;

  const feedbackType: FeedbackType = ENHANCEMENT_SIGNAL.test(input) && !BUG_SIGNAL.test(input)
    ? 'enhancement'
    : 'bug';
  const description = stripPrefix(input);
  return {
    feedbackType,
    title: firstSentence(input) || (feedbackType === 'bug' ? 'App issue' : 'Product improvement'),
    description,
    expectedOutcome: '',
    reproductionSteps: '',
  };
}

export function feedbackIntentFromSeed(seed: FeedbackDraftSeed, currentPage: string): IntentResult {
  return {
    function: 'draftFeedback',
    arguments: {
      ...seed,
      currentPage,
    },
    userFacingLabel: { zh: '提交产品反馈', en: 'Submit feedback' },
    confidence: 100,
    contextSufficient: false,
  } as IntentResult;
}
