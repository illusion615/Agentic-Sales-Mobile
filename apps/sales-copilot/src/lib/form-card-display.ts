import { format } from 'date-fns/format';
import { t, type Locale, type TranslationKey } from '@/lib/i18n';
import { formatCurrencyCompact } from '@/lib/format-currency';
import {
  activityDraftDateLabelKey,
  activityDraftModeLabelKey,
  resolveActivityDraftMode,
} from '@/lib/activity-draft-mode';

export type FormCardEntityType = 'activity' | 'opportunity' | 'account' | 'contact' | 'feedback';

function textField(data: Record<string, unknown>, field: string): string {
  const value = data[field];
  return typeof value === 'string' ? value.trim() : '';
}

export interface ContactCardDisplayFields {
  name: string;
  title: string;
  accountName: string;
}

/** Semantic display fields for a contact card: person, role, then company. */
export function contactCardDisplayFields(data: Record<string, unknown>): ContactCardDisplayFields {
  return {
    name: textField(data, 'fullName') || textField(data, 'fullname') || textField(data, 'name'),
    title: textField(data, 'title'),
    accountName: textField(data, 'accountName'),
  };
}

const PRIMARY_TEXT_FIELDS: Record<FormCardEntityType, readonly string[]> = {
  activity: ['title', 'name'],
  opportunity: ['name', 'title'],
  account: ['name'],
  // A contact's job title is metadata, never its name. `fullname` supports
  // persisted cards from older app versions while `fullName` is canonical.
  contact: ['fullName', 'fullname', 'name'],
  feedback: ['title', 'name'],
};

/** Primary record name shown in saved/cancelled form-card headers. */
export function formCardPrimaryText(
  type: FormCardEntityType,
  data: Record<string, unknown>,
): string {
  if (type === 'contact') return contactCardDisplayFields(data).name;

  for (const field of PRIMARY_TEXT_FIELDS[type]) {
    const value = textField(data, field);
    if (value) return value;
  }
  return '';
}

// ── Saved-card preview model ────────────────────────────────────────────────
// A saved (confirmed) form card discloses each record with a `·`-separated
// "identity" line always visible in the collapsed header, plus expand-only
// fields. The split is chosen per entity's business meaning, and — critically —
// no field appears in both places (the redundancy users complained about).

const ACTIVITY_TYPE_KEYS: Record<string, TranslationKey> = {
  visit: 'typeVisit',
  call: 'typeCall',
  meeting: 'typeMeeting',
  email: 'typeEmail',
};

const STAGE_KEYS: Record<string, TranslationKey> = {
  prospecting: 'stageProspecting',
  qualification: 'stageQualification',
  proposal: 'stageProposal',
  negotiation: 'stageNegotiation',
  won: 'stageWon',
  lost: 'stageLost',
};

/** Format an ISO/date string for compact display; falls back to the raw value. */
function formatCardDate(dateStr: string | undefined, locale: Locale): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return format(d, t('dateFormatLong', locale));
}

/** Stable field id emitted by the builder; the renderer maps it to an icon so
 *  this pure module stays free of JSX/icon dependencies. */
export type SavedCardRowKey =
  | 'opportunity'
  | 'attendees'
  | 'contact'
  | 'close'
  | 'confidence'
  | 'email'
  | 'address'
  | 'notes'
  | 'phone'
  | 'feedbackDetail'
  | 'expectedOutcome'
  | 'reproductionSteps';

export interface SavedCardRow {
  key: SavedCardRowKey;
  label: string;
  value: string;
}

export interface SavedCardDetails {
  /** Collapsed one-line, `·`-separated at-a-glance identity for the record. */
  summary: string;
  /** Expanded discrete fields — only those NOT already surfaced in `summary`. */
  rows: SavedCardRow[];
  /** Optional free-text narrative (activity result) rendered as a paragraph. */
  description?: string;
}

/**
 * Build the saved-card preview model for a confirmed record. Per entity we pick
 * which fields belong on the always-visible identity line vs. the in-card
 * expansion, based on business meaning — never a one-size-fits-all template, and
 * never repeating a summary field inside the expanded rows.
 */
export function buildSavedCardDetails(
  type: FormCardEntityType,
  formData: Record<string, unknown>,
  locale: Locale,
): SavedCardDetails {
  const str = (k: string) => (typeof formData[k] === 'string' ? (formData[k] as string).trim() : '');
  const rows: SavedCardRow[] = [];
  let summary = '';
  let description: string | undefined;

  if (type === 'activity') {
    const at = str('type') || 'visit';
    const atKey = ACTIVITY_TYPE_KEYS[at];
    const atLabel = atKey ? t(atKey, locale) : at;
    const activityMode = resolveActivityDraftMode({
      temporalMode: formData.temporalMode,
      scheduledDate: formData.scheduledDate,
    });
    const modeLabel = t(activityDraftModeLabelKey(activityMode), locale);
    const dateStr = formatCardDate(str('scheduledDate'), locale);
    const accName = str('accountName');
    const oppName = str('opportunityName');
    const attendees = (formData.attendees as Array<{ id: string; fullname: string }>) || [];
    const attendeeNames = attendees.map((a) => a.fullname).filter(Boolean).join(', ');
    const contactName = str('contactName');

    // Identity: what happened · planned/completed · when · for whom.
    summary = [atLabel, modeLabel, dateStr, accName].filter(Boolean).join(' · ');
    // Expansion reveals the relationships and the narrative, nothing repeated.
    rows.push({ key: 'opportunity', label: t('linkedOpportunity', locale), value: oppName });
    if (at === 'visit' || at === 'meeting') {
      rows.push({ key: 'attendees', label: t('attendees', locale), value: attendeeNames });
    } else {
      rows.push({ key: 'contact', label: t('contact', locale), value: contactName });
    }
    description = str('result') || undefined;
  } else if (type === 'opportunity') {
    const stage = str('stage') || 'prospecting';
    const stageKey = STAGE_KEYS[stage];
    const stageLabel = stageKey ? t(stageKey, locale) : stage;
    const amount = typeof formData.amount === 'number' ? formData.amount : Number(str('amount'));
    const amountStr = amount ? formatCurrencyCompact(amount) : '';
    const confidence = typeof formData.confidence === 'number' ? formData.confidence : Number(str('confidence'));
    const confStr = Number.isFinite(confidence) && confidence > 0 ? `${confidence}%` : '';
    const closeStr = formatCardDate(str('expectedCloseDate'), locale);

    // Identity: the deal's stage, size and owning account.
    summary = [stageLabel, amountStr, str('accountName')].filter(Boolean).join(' · ');
    rows.push({ key: 'close', label: t('expectedClose', locale), value: closeStr });
    rows.push({ key: 'confidence', label: t('confidence', locale), value: confStr });
  } else if (type === 'account') {
    // Identity: sector + primary reach; expansion completes the contact card.
    summary = [str('industry'), str('phone')].filter(Boolean).join(' · ');
    rows.push({ key: 'email', label: t('fieldEmail', locale), value: str('email') });
    rows.push({ key: 'address', label: t('fieldAddress', locale), value: str('address') });
    rows.push({ key: 'notes', label: t('notes', locale), value: str('notes') });
  } else if (type === 'contact') {
    const contact = contactCardDisplayFields(formData);
    // Identity: role at company; expansion adds the reach channels.
    summary = [contact.title, contact.accountName].filter(Boolean).join(' · ');
    rows.push({ key: 'phone', label: t('fieldPhone', locale), value: str('phone') });
    rows.push({ key: 'email', label: t('fieldEmail', locale), value: str('email') });
  } else if (type === 'feedback') {
    const isBug = str('feedbackType') !== 'enhancement';
    const typeLabel = isBug
      ? (locale === 'zh-Hans' ? '缺陷' : 'Bug')
      : (locale === 'zh-Hans' ? '改进建议' : 'Improvement');
    summary = [typeLabel, locale === 'zh-Hans' ? '已收集' : 'Collected'].join(' · ');
    rows.push({
      key: 'feedbackDetail',
      label: isBug
        ? (locale === 'zh-Hans' ? '实际表现' : 'Actual behavior')
        : (locale === 'zh-Hans' ? '改进内容' : 'Requested improvement'),
      value: str('description'),
    });
    rows.push({
      key: 'expectedOutcome',
      label: locale === 'zh-Hans' ? '期望结果' : 'Expected outcome',
      value: str('expectedOutcome'),
    });
    rows.push({
      key: 'reproductionSteps',
      label: locale === 'zh-Hans' ? '复现步骤' : 'Reproduction steps',
      value: str('reproductionSteps'),
    });
  }

  return { summary, rows: rows.filter((r) => r.value), description };
}