/**
 * New-user onboarding tour.
 * --------------------------------------------------------------------------
 * A guided product tour built on driver.js (mature, ~5KB, zero-dep spotlight
 * library). It mixes centered concept cards (no anchor) with spotlight steps
 * that highlight real UI elements tagged with `data-tour="…"`.
 *
 * Robustness: element steps are filtered at runtime to those actually present
 * and visible, so the tour never breaks regardless of screen, layout (mobile
 * float vs docked) or configuration. Concept cards always show.
 *
 * Shown automatically on first launch (localStorage flag) and re-runnable from
 * Settings / Help. Fully bilingual, following the app locale.
 */
import { driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { getLocale, type Locale } from '@/lib/i18n';

const DONE_KEY = 'onboardingDone';

export function getOnboardingDone(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(DONE_KEY) === 'true';
}

export function setOnboardingDone(done: boolean): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(DONE_KEY, done ? 'true' : 'false');
  }
}

interface Bilingual {
  zh: string;
  en: string;
}

interface OnboardingStep {
  /** CSS selector of a `data-tour` anchor; omit for a centered concept card. */
  element?: string;
  title: Bilingual;
  description: Bilingual;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
}

const STEPS: OnboardingStep[] = [
  {
    title: { zh: '👋 欢迎使用 Sales Copilot', en: '👋 Welcome to Sales Copilot' },
    description: {
      zh: '你的移动销售助手。用一句话就能记录拜访、查客户商机、安排跟进——大多数事都交给 AI 助手完成。这就带你快速看一遍。',
      en: 'Your mobile sales assistant. Log visits, look up accounts and deals, and plan follow-ups in a single sentence — most things are done through the AI assistant. Here is a quick tour.',
    },
  },
  {
    element: '[data-tour="copilot-input"]',
    title: { zh: '💬 和 AI 助手对话', en: '💬 Talk to your assistant' },
    description: {
      zh: '在这里打字，或点右侧麦克风按住说话。例如：「我今天拜访了协和医院，和张主任聊了监护仪项目」「列出本月的活跃商机」。',
      en: 'Type here, or hold the mic button on the right to speak. e.g. "I visited the General Hospital today and discussed the monitor deal" or "List active opportunities this month".',
    },
    side: 'top',
    align: 'center',
  },
  {
    element: '[data-tour="home-dashboard"]',
    title: { zh: '📊 首页一览', en: '📊 Your dashboard' },
    description: {
      zh: '今日日程、关键指标和需要关注的风险客户都在这里。逾期任务清零时还有小惊喜。',
      en: "Today's agenda, key metrics, and at-risk clients live here — with a little celebration when you clear all overdue tasks.",
    },
    side: 'bottom',
    align: 'center',
  },
  {
    element: '[data-tour="home-insights"]',
    title: { zh: '🔔 洞察与提醒', en: '🔔 Insights & alerts' },
    description: {
      zh: '铃铛里是 AI 为你生成的业务洞察和提醒，红点表示有新内容。',
      en: 'The bell holds AI-generated business insights and reminders; a red dot means something new.',
    },
    side: 'bottom',
    align: 'end',
  },
  {
    element: '[data-tour="nav-products"]',
    title: { zh: '📖 产品手册', en: '📖 Product manual' },
    description: {
      zh: '随时查阅产品资料，给客户介绍时用得上。',
      en: 'Browse product information anytime — handy when introducing products to customers.',
    },
    side: 'bottom',
    align: 'end',
  },
  {
    element: '[data-tour="nav-settings"]',
    title: { zh: '⚙️ 设置', en: '⚙️ Settings' },
    description: {
      zh: '语言、语音、外观主题、氛围动画，以及 AI 助手的连接配置都在这里。第一次使用请先在这里完成配置。',
      en: 'Language, voice, appearance, feedback animations, and the AI assistant connection all live here. On first use, configure the assistant here.',
    },
    side: 'bottom',
    align: 'end',
  },
  {
    title: { zh: '🎉 开始使用吧', en: '🎉 You are all set' },
    description: {
      zh: '随时可以在「设置」或「帮助与反馈」里重新打开本指引。祝你拿下更多订单！',
      en: 'You can reopen this tour anytime from Settings or Help & Feedback. Go close more deals!',
    },
  },
];

function isVisible(selector: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const cs = getComputedStyle(el);
  if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
  return true;
}

/** Run the onboarding tour now. Marks it done when the tour closes. */
export function startOnboarding(locale: Locale = getLocale()): void {
  const pick = (b: Bilingual) => (locale === 'zh-Hans' ? b.zh : b.en);

  const steps: DriveStep[] = STEPS.filter((s) => !s.element || isVisible(s.element)).map((s) => ({
    element: s.element,
    popover: {
      title: pick(s.title),
      description: pick(s.description),
      side: s.side,
      align: s.align,
    },
  }));

  const tour = driver({
    showProgress: true,
    allowClose: true,
    overlayOpacity: 0.6,
    stagePadding: 6,
    stageRadius: 12,
    popoverClass: 'sc-onboarding',
    nextBtnText: locale === 'zh-Hans' ? '下一步' : 'Next',
    prevBtnText: locale === 'zh-Hans' ? '上一步' : 'Back',
    doneBtnText: locale === 'zh-Hans' ? '完成' : 'Done',
    progressText: '{{current}} / {{total}}',
    steps,
    onDestroyed: () => setOnboardingDone(true),
  });

  tour.drive();
}

/**
 * Start the tour automatically the first time the app is used. Waits briefly so
 * the home screen's anchors are mounted before highlighting them.
 */
export function maybeStartOnboarding(locale: Locale = getLocale()): void {
  if (getOnboardingDone()) return;
  window.setTimeout(() => {
    // Re-check: another trigger may have completed it while we waited.
    if (getOnboardingDone()) return;
    startOnboarding(locale);
  }, 1200);
}
