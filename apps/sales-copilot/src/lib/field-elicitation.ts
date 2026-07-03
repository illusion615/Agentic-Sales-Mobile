/**
 * Field elicitation contract (boss directive 2026-07-02).
 *
 * The missing-SUBJECT gate answers "which record?". This module is the source of
 * truth for the missing-PARAMETER gate — "what to change / to what value?". When
 * an update tool resolves its subject but carries no concrete field value, the
 * runtime elicits the value from the user via the RIGHT control:
 *   - enum / dictionary field  → chip selection (never free-text)
 *   - scalar (text/number/date)→ typed input
 * driven entirely by the registry `parameters` (enum values live there already).
 */
import { availableFunctions, type FunctionParameter } from './function-registry';
import type { Locale } from './i18n';

export type FieldKind = 'enum' | 'text' | 'number' | 'date';

/**
 * User-settable "value" fields offered in the "what do you want to change?" menu
 * for each update tool. Curated (excludes the subject id/name, entity-reference
 * pass-throughs, and attendee arrays, which have their own flows). Order = menu order.
 */
const VALUE_FIELDS: Record<string, string[]> = {
  updateOpportunity: ['stage', 'amount', 'expectedCloseDate', 'name', 'confidence'],
  updateActivity: ['status', 'type', 'scheduledDate', 'title', 'notes'],
  updateAccount: ['tier', 'region', 'industry', 'name', 'phone', 'email', 'address', 'notes'],
  updateContact: ['fullName', 'title', 'phone', 'email'],
};

/**
 * Params that, when present, mean the user asked for a concrete VALUE change.
 * Deliberately EXCLUDES entity-reference fields (accountId/accountName/opportunityId/…):
 * the subject pick and page context auto-inject the record's OWN parent ids, which
 * must NOT be mistaken for a change (that was the "Updated: account" no-op bug).
 * Attendee arrays ARE real changes and are included.
 */
const MUTATING_PARAMS: Record<string, string[]> = {
  updateOpportunity: ['name', 'amount', 'stage', 'confidence', 'expectedCloseDate', 'lastAction'],
  updateActivity: ['title', 'type', 'scheduledDate', 'result', 'notes', 'status', 'addAttendeeNames', 'removeAttendeeNames'],
  updateAccount: ['name', 'industry', 'region', 'tier', 'phone', 'email', 'address', 'notes'],
  updateContact: ['fullName', 'title', 'phone', 'email'],
};

const FIELD_LABELS: Record<string, { zh: string; en: string }> = {
  stage: { zh: '阶段', en: 'Stage' },
  amount: { zh: '金额', en: 'Amount' },
  expectedCloseDate: { zh: '预计成交日期', en: 'Expected close date' },
  name: { zh: '名称', en: 'Name' },
  confidence: { zh: '信心度', en: 'Confidence' },
  status: { zh: '状态', en: 'Status' },
  type: { zh: '类型', en: 'Type' },
  scheduledDate: { zh: '日期', en: 'Date' },
  title: { zh: '标题', en: 'Title' },
  notes: { zh: '备注', en: 'Notes' },
  result: { zh: '结果', en: 'Result' },
  tier: { zh: '等级', en: 'Tier' },
  region: { zh: '区域', en: 'Region' },
  industry: { zh: '行业', en: 'Industry' },
  phone: { zh: '电话', en: 'Phone' },
  email: { zh: '邮箱', en: 'Email' },
  address: { zh: '地址', en: 'Address' },
  fullName: { zh: '姓名', en: 'Full name' },
};

/** Localized labels for enum VALUES, keyed by `${field}.${value}`. */
const ENUM_VALUE_LABELS: Record<string, { zh: string; en: string }> = {
  'stage.prospecting': { zh: '潜在', en: 'Prospecting' },
  'stage.qualification': { zh: '资格确认', en: 'Qualification' },
  'stage.proposal': { zh: '方案', en: 'Proposal' },
  'stage.negotiation': { zh: '谈判', en: 'Negotiation' },
  'stage.won': { zh: '赢单', en: 'Won' },
  'stage.lost': { zh: '输单', en: 'Lost' },
  'type.visit': { zh: '拜访', en: 'Visit' },
  'type.call': { zh: '电话', en: 'Call' },
  'type.meeting': { zh: '会议', en: 'Meeting' },
  'type.email': { zh: '邮件', en: 'Email' },
  'status.open': { zh: '进行中', en: 'Open' },
  'status.completed': { zh: '已完成', en: 'Completed' },
  'status.canceled': { zh: '已取消', en: 'Canceled' },
  // account.region / account.tier values are already human-readable → identity label.
};

function paramOf(fn: string, field: string): FunctionParameter | undefined {
  return availableFunctions.find((x) => x.name === fn)?.parameters.properties[field];
}

/** True when the function is an update tool that participates in field elicitation. */
export function isElicitableUpdate(fn: string): boolean {
  return fn in MUTATING_PARAMS;
}

/** Classify a field's input control from the registry contract. */
export function fieldKind(fn: string, field: string): FieldKind {
  const p = paramOf(fn, field);
  if (!p) return 'text';
  if (p.enum && p.enum.length > 0) return 'enum';
  if (p.type === 'number') return 'number';
  if (/date/i.test(field)) return 'date';
  return 'text';
}

export function fieldLabel(field: string, locale: Locale): string {
  const m = FIELD_LABELS[field];
  return m ? (locale === 'zh-Hans' ? m.zh : m.en) : field;
}

/** Chip options for an enum field, derived from the registry `enum` + labels. */
export function enumOptions(fn: string, field: string, locale: Locale): Array<{ value: string; label: string }> {
  const values = paramOf(fn, field)?.enum ?? [];
  return values.map((v) => {
    const lm = ENUM_VALUE_LABELS[`${field}.${v}`];
    return { value: v, label: lm ? (locale === 'zh-Hans' ? lm.zh : lm.en) : v };
  });
}

/** The settable value fields for an update tool, with control kind + label. */
export function updatableFields(
  fn: string,
  locale: Locale,
): Array<{ name: string; kind: FieldKind; label: string }> {
  return (VALUE_FIELDS[fn] ?? [])
    .filter((n) => paramOf(fn, n))
    .map((n) => ({ name: n, kind: fieldKind(fn, n), label: fieldLabel(n, locale) }));
}

/**
 * Does this update intent already carry at least one concrete change? When false,
 * the runtime must elicit a field/value instead of letting the handler hard-fail
 * with "No fields to update".
 */
export function hasConcreteUpdateValue(fn: string, args: Record<string, unknown>): boolean {
  const names = MUTATING_PARAMS[fn];
  if (!names) return true; // not a gated update tool → never block
  return names.some((n) => {
    const v = args[n];
    if (Array.isArray(v)) return v.length > 0;
    return v !== undefined && v !== null && v !== '';
  });
}
