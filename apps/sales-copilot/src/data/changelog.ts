/**
 * Release changelog — the single source of truth for the app's version history
 * and the in-app "What's New" surface.
 *
 * Why this file exists: releases (each `power-apps push`) were never recorded
 * anywhere — the only version signal was the build fingerprint
 * (`__BUILD_TIMESTAMP__`), which changes on every rebuild and carries no notes.
 * This file is the durable, human-readable record AND the data the "What's New"
 * dialog reads after a new release loads.
 *
 * When to cut a release: on EVERY merge of a branch into main (boss policy
 * 2026-07-07) — each merged branch gets a new version and its What's New here.
 *
 * How to cut a release:
 *   1. Add a new entry at the TOP of CHANGELOG (newest first).
 *   2. Bump `version` (semver). This value is also the per-release "seen" key,
 *      so the What's New only shows once per version.
 *   3. Keep `items` USER-FACING (features / improvements / notable fixes) — no
 *      internal refactors, chores, or docs.
 *   4. Keep package.json "version" in sync for repo hygiene.
 *
 * Text is bilingual (zh + en). Non-Chinese locales (en/de/fr/es) fall back to
 * `en`, matching the codebase's BilingualLabel convention.
 *
 * NOTE: entries dated before 2026-07-04 were reconstructed from git history and
 * repo notes when this changelog was introduced; they are curated highlights,
 * not an exhaustive commit list.
 */

export type ChangeKind = 'feature' | 'improvement' | 'fix';

export interface ChangelogItem {
  kind: ChangeKind;
  zh: string;
  en: string;
}

export interface ChangelogEntry {
  /** Semantic version. Also the key used to remember the What's New was seen. */
  version: string;
  /** Release date, yyyy-mm-dd. */
  date: string;
  /** Short release theme. */
  title: { zh: string; en: string };
  /** User-facing highlights for this release. */
  items: ChangelogItem[];
}

/** Newest first. The first entry is the current release. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.9.0',
    date: '2026-07-14',
    title: { zh: '洞察直接变行动', en: 'Turn insights into action' },
    items: [
      {
        kind: 'feature',
        zh: '活动洞察会结合客户、商机与活动内容，给出少量有明确原因的下一步行动；可调整日期并直接创建任务。',
        en: 'Activity insights now use account, opportunity, and activity context to recommend a few well-explained next actions. Adjust the date and create the task directly.',
      },
      {
        kind: 'feature',
        zh: '活动详情新增快捷操作：标记完成、重新安排、取消和重新开启，处理活动无需再进入编辑表单。',
        en: 'Activity details now include quick actions to complete, reschedule, cancel, or reopen work without opening the edit form.',
      },
      {
        kind: 'fix',
        zh: '已取消活动不再出现在今日待办或逾期任务中，进行中、已完成和已取消状态在各页面保持一致。',
        en: 'Cancelled activities no longer appear in today’s agenda or overdue work, and Open, Completed, and Cancelled statuses are consistent across the app.',
      },
      {
        kind: 'improvement',
        zh: '手机上从 Copilot 打开记录后，面板会自动收起；安卓面板背景也更清晰，不再与底层页面互相干扰。',
        en: 'On mobile, opening a record from Copilot now collapses the panel automatically. Android panels are also clearer and no longer visually blend into the page behind them.',
      },
      {
        kind: 'fix',
        zh: '云端语音是可选能力：未部署时不会启用或打扰用户；已部署时，首次打开应用也不再要求用户输入连接器密钥。',
        en: 'Cloud speech is now truly optional: it stays out of the way when not deployed, and deployed apps no longer ask users to enter a connector key on first launch.',
      },
    ],
  },
  {
    version: '1.8.0',
    date: '2026-07-13',
    title: { zh: '语音更灵活，移动端更顺手', en: 'More flexible voice, smoother on mobile' },
    items: [
      {
        kind: 'feature',
        zh: '语音输入方式可选：自动、浏览器语音识别、设备键盘听写、或云端语音（Azure）。选“自动”会挑当前设备最合适的一种。',
        en: 'Choose how voice input works — Auto, browser speech recognition, device-keyboard dictation, or cloud voice (Azure). “Auto” picks whichever fits your device best.',
      },
      {
        kind: 'improvement',
        zh: '安卓输入法不再遮挡：在安卓上点输入框时，键盘不再挡住下方内容，输入框会自动抬到键盘上方。',
        en: 'Android keyboard no longer overlaps: on Android, tapping the composer now lifts the input above the on-screen keyboard instead of hiding behind it.',
      },
      {
        kind: 'fix',
        zh: '排程改日期修复：智能规划里点任务日期会直接弹出日历，可选任意自定义日期（此前网页无反应、手机弹窗错位）。',
        en: 'Scheduling date fix: tapping a planned task’s date now opens a calendar to pick any date (previously unresponsive on web and mispositioned on mobile).',
      },
      {
        kind: 'improvement',
        zh: '默认更简洁：新用户默认不再自动生成“下一步建议”，界面更清爽、更省资源；需要时可在设置里开启。',
        en: 'Cleaner by default: for new users, automatic “next-step suggestions” are now off for a cleaner, lighter experience. Turn them on anytime in Settings.',
      },
    ],
  },
  {
    version: '1.7.0',
    date: '2026-07-07',
    title: { zh: '开口即用的语音助手', en: 'Talk to your assistant' },
    items: [
      {
        kind: 'feature',
        zh: '语音输入：在对话框点一下麦克风开始说话，再点一下结束，说的话会自动变成文字。即使手机没有内置听写也能用。',
        en: 'Voice input: tap the mic in the composer to start talking, tap again to stop, and your words turn into text automatically — even on phones without built-in dictation.',
      },
      {
        kind: 'feature',
        zh: '语音朗读：AI 回复和每日简报现在可以用自然的声音朗读出来，即使手机没有内置语音也能听。',
        en: 'Read aloud: assistant replies and your daily briefing can now be read out in a natural voice — even on phones without a built-in voice.',
      },
      {
        kind: 'improvement',
        zh: '语音设置：可挑选朗读嗓音；当设备本地语音与云端语音都可用时，还能选择优先用哪一种。',
        en: 'Voice settings: pick the read-aloud voice, and when both on-device and cloud voices are available, choose which one to use.',
      },
    ],
  },
  {
    version: '1.6.0',
    date: '2026-07-06',
    title: { zh: '更聪明的客户洞察', en: 'Smarter account insights' },
    items: [
      {
        kind: 'feature',
        zh: '客户洞察升级为「市场洞察」和「销售洞察」两部分：市场洞察汇总客观的行业动态、新闻与风险；销售洞察在此基础上结合你的商机与活动，给出可执行的销售建议。',
        en: 'Account insights are now split into Market Insight and Sales Insight — Market Insight gathers objective industry news, trends, and risks, while Sales Insight turns those facts, plus your pipeline and activities, into actionable selling guidance.',
      },
      {
        kind: 'improvement',
        zh: '客户页顶部新增一句话公司简介，快速了解这家企业。',
        en: 'A concise company profile now appears at the top of each account page.',
      },
      {
        kind: 'improvement',
        zh: '洞察中引用的信息来源可直接点击，打开原始报道。',
        en: 'Sources cited in insights are now clickable and open the original article.',
      },
      {
        kind: 'improvement',
        zh: '行业等字段显示为易读名称，不再是代码。',
        en: 'Industry and similar fields now show readable names instead of internal codes.',
      },
      {
        kind: 'improvement',
        zh: 'AI 生成内容的排版更整洁规范，列表、表格与编号显示更清晰。',
        en: 'AI-generated content is cleaner and easier to read, with properly formatted lists, tables, and numbering.',
      },
      {
        kind: 'fix',
        zh: '修复销售洞察中行动项编号显示异常的问题。',
        en: 'Fixed action-item numbering in Sales Insight.',
      },
    ],
  },
  {
    version: '1.5.0',
    date: '2026-07-04',
    title: { zh: '离线也能用', en: 'Now works offline' },
    items: [
      {
        kind: 'feature',
        zh: '断网也能打开应用，查看最近的客户、商机和活动。',
        en: 'Open the app and view your recent customers, deals, and activities even without a connection.',
      },
      {
        kind: 'feature',
        zh: '没有网络时也能记录拜访，恢复联网后自动上传。',
        en: 'Log visits while offline — they upload automatically once you reconnect.',
      },
      {
        kind: 'feature',
        zh: '每次更新后自动显示「What\'s New」，一眼看到本次更新带来的新变化。',
        en: 'A "What\'s New" summary appears after each update so you can see what changed at a glance.',
      },
      {
        kind: 'improvement',
        zh: '随时清楚显示当前是在线还是离线。',
        en: 'Always see at a glance whether you are online or offline.',
      },
      {
        kind: 'improvement',
        zh: '应用打开更快。',
        en: 'The app opens faster.',
      },
      {
        kind: 'improvement',
        zh: '成功、失败等操作会播放你在设置里选择的反馈动画。',
        en: 'Success, failure and other actions now play the feedback animation you picked in Settings.',
      },
      {
        kind: 'fix',
        zh: '网络不稳定时不再卡在加载界面。',
        en: 'No more getting stuck on the loading screen when the connection is flaky.',
      },
      {
        kind: 'fix',
        zh: '离线时不再反复弹出错误提示。',
        en: 'No more repeated error popups while offline.',
      },
    ],
  },
  {
    version: '1.4.0',
    date: '2026-07-04',
    title: { zh: '可交互的图表', en: 'Interactive charts' },
    items: [
      {
        kind: 'feature',
        zh: '问 AI 就能生成可交互的图表（如销售管道、趋势），点击可查看明细。',
        en: 'Ask the AI to create interactive charts — like your sales pipeline or trends — and tap to see the details.',
      },
      {
        kind: 'improvement',
        zh: 'AI 的分析回复排版更清晰、更易读。',
        en: "The AI's analysis is now easier to read, with clearer formatting.",
      },
    ],
  },
  {
    version: '1.3.0',
    date: '2026-07-03',
    title: { zh: '助手更聪明、更稳定', en: 'Smarter, steadier assistant' },
    items: [
      {
        kind: 'feature',
        zh: 'AI 助手更擅长处理复杂请求，会在关键处先与你确认。',
        en: 'The AI assistant handles complex requests better and confirms with you at key steps.',
      },
      {
        kind: 'fix',
        zh: '修复在手机上打开应用有时卡住的问题。',
        en: 'Fixed the app sometimes hanging when opened on a phone.',
      },
    ],
  },
  {
    version: '1.2.0',
    date: '2026-06-26',
    title: { zh: '更多语言', en: 'More languages' },
    items: [
      {
        kind: 'feature',
        zh: '新增德语、法语、西班牙语，共支持 5 种语言。',
        en: 'Added German, French, and Spanish — 5 languages in total.',
      },
    ],
  },
  {
    version: '1.1.0',
    date: '2026-06-25',
    title: { zh: '体验优化', en: 'Experience polish' },
    items: [
      {
        kind: 'feature',
        zh: '操作成功或失败时，新增更生动的即时反馈。',
        en: 'More lively, instant feedback when an action succeeds or fails.',
      },
      {
        kind: 'feature',
        zh: '新增新手引导，帮助你快速上手。',
        en: 'Added an onboarding tour to help you get started quickly.',
      },
      {
        kind: 'improvement',
        zh: '联系人匹配更准确、信息更完整。',
        en: 'More accurate contact matching, with fuller details.',
      },
    ],
  },
  {
    version: '1.0.0',
    date: '2026-06-24',
    title: { zh: '首个正式版本', en: 'Public launch' },
    items: [
      {
        kind: 'feature',
        zh: '销售智能助手：一站式管理客户、联系人、商机与活动。',
        en: 'Your sales copilot: manage accounts, contacts, opportunities, and activities in one place.',
      },
      {
        kind: 'feature',
        zh: '支持语音提问与语音播报。',
        en: 'Ask by voice and hear spoken summaries.',
      },
      {
        kind: 'feature',
        zh: '智能建议，随时提示下一步。',
        en: 'Smart suggestions that nudge you toward the next step.',
      },
    ],
  },
];

/** The current release version — the newest changelog entry. */
export const CURRENT_VERSION = CHANGELOG[0].version;

/** The current release entry (for the "What's New" surface). */
export const CURRENT_RELEASE = CHANGELOG[0];
