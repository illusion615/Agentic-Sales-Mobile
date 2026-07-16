/**
 * Per-user opportunity business settings — the single source for how a sales rep
 * configures their quarterly targets and at-risk threshold.
 *
 * Storage: reuses the existing Dataverse `crf5c_setting` (key/value) table. One
 * row per user, `settingKey = business_settings:<Entra objectId>`, the value is
 * this JSON blob. Dataverse stamps the owner, so rows stay per-user without a new
 * table. This module is pure (parse / defaults / quarter math) so it is unit
 * tested and never re-derived inline.
 */
export interface BusinessSettings {
  /** Quarterly sales targets keyed by `${year}-Q${1-4}` (e.g. "2026-Q3"). */
  targets: Record<string, number>;
  /** Confidence % (1-99) BELOW which an opportunity counts as at-risk. */
  riskThreshold: number;
}

export const DEFAULT_RISK_THRESHOLD = 50;

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  targets: {},
  riskThreshold: DEFAULT_RISK_THRESHOLD,
};

/** Per-user Setting row key. */
export const businessSettingsKey = (objectId: string): string => `business_settings:${objectId}`;

/** Compose the targets-map key for a given year + quarter (1-4). */
export function targetKey(year: number, quarter: number): string {
  return `${year}-Q${quarter}`;
}

/** The calendar year + quarter (1-4) for a date. */
export function currentQuarter(date: Date = new Date()): { year: number; quarter: number } {
  return { year: date.getFullYear(), quarter: Math.floor(date.getMonth() / 3) + 1 };
}

/** A configured target for a specific quarter, or undefined when unset/zero. */
export function quarterTargetFor(settings: BusinessSettings, year: number, quarter: number): number | undefined {
  const v = settings.targets[targetKey(year, quarter)];
  return typeof v === 'number' && v > 0 ? v : undefined;
}

/** Parse (and defensively validate) the stored JSON into settings. */
export function parseBusinessSettings(json: string | undefined | null): BusinessSettings {
  if (!json || !json.trim()) return { ...DEFAULT_BUSINESS_SETTINGS, targets: {} };
  try {
    const raw = JSON.parse(json) as Partial<BusinessSettings>;
    const targets: Record<string, number> = {};
    if (raw.targets && typeof raw.targets === 'object') {
      for (const [k, v] of Object.entries(raw.targets)) {
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0) targets[k] = v;
      }
    }
    const riskThreshold =
      typeof raw.riskThreshold === 'number' && raw.riskThreshold >= 1 && raw.riskThreshold <= 99
        ? Math.round(raw.riskThreshold)
        : DEFAULT_RISK_THRESHOLD;
    return { targets, riskThreshold };
  } catch {
    return { ...DEFAULT_BUSINESS_SETTINGS, targets: {} };
  }
}

export function serializeBusinessSettings(settings: BusinessSettings): string {
  return JSON.stringify(settings);
}
