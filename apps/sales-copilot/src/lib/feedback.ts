/**
 * Scenario Feedback Animations — pure logic core (no React).
 * --------------------------------------------------------------------------
 * Gives the app a small, composable set of "atmospheric" feedback animations
 * that the user can mix and match per scenario from Settings, mirroring the
 * existing à-la-carte style options (dark/light, color theme, thinking dots).
 *
 * Architecture (decoupled, registry-driven, extensible):
 *
 *   event happens  ──fireFeedback(scenario)──▶  bus
 *                                                 │
 *                              FeedbackHost subscribes, looks up the user's
 *                              chosen style for that scenario, renders it.
 *
 *   - SCENARIOS: the occasions that can play an animation (success, milestone,
 *     failure, warning). Each declares which styles it allows + a default.
 *   - STYLE_META: every animation style's label + duration. The visual React
 *     component for each style lives in components/feedback/style-registry.tsx
 *     (this module stays framework-free so it is unit-testable in isolation).
 *
 * Adding a new animation  = add an id to FeedbackStyleId + an entry to
 *                           STYLE_META + a component in the style-registry, and
 *                           list it under the relevant scenario(s).
 * Adding a new scenario   = add an id to FeedbackScenario + an entry to
 *                           SCENARIOS, then call fireFeedback() where it occurs.
 *
 * Persistence: per-scenario choice + master toggle in localStorage, same as
 * thinkingDotStyle. Defaults preserve current behaviour (milestone = confetti,
 * everything else = none) so existing users see no change until they opt in.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Occasions that can trigger a feedback animation. */
export type FeedbackScenario = 'success' | 'milestone' | 'failure' | 'warning';

/** All available animation styles across all scenarios. `none` = disabled. */
export type FeedbackStyleId =
  | 'none'
  // success
  | 'check-pulse'
  | 'glow'
  // milestone (celebration)
  | 'confetti'
  | 'fireworks'
  | 'sparkle'
  // failure
  | 'shake'
  | 'red-pulse'
  // warning
  | 'attention-ring'
  | 'blink';

export interface BilingualLabel {
  zh: string;
  en: string;
  de?: string;
  fr?: string;
  es?: string;
}

export interface FeedbackStyleMeta {
  id: FeedbackStyleId;
  label: BilingualLabel;
  /** How long the host keeps the animation mounted, in ms. */
  durationMs: number;
}

export interface FeedbackScenarioMeta {
  id: FeedbackScenario;
  label: BilingualLabel;
  /** Short description of when it fires, for the Settings UI. */
  hint: BilingualLabel;
  /** Style ids selectable for this scenario (always includes 'none'). */
  styles: FeedbackStyleId[];
  /** Style applied when the user has never chosen one. */
  defaultStyle: FeedbackStyleId;
}

// ---------------------------------------------------------------------------
// Style metadata (label + duration). Visual components are registered in
// components/feedback/style-registry.tsx, keyed by the same ids.
// ---------------------------------------------------------------------------

export const STYLE_META: Record<FeedbackStyleId, FeedbackStyleMeta> = {
  'none': { id: 'none', label: { zh: '无', en: 'None', de: 'Keine', fr: 'Aucun', es: 'Ninguno' }, durationMs: 0 },
  'check-pulse': { id: 'check-pulse', label: { zh: '对勾脉冲', en: 'Check Pulse', de: 'Häkchen-Puls', fr: 'Pulsation de validation', es: 'Pulso de verificación' }, durationMs: 1200 },
  'glow': { id: 'glow', label: { zh: '微光', en: 'Glow', de: 'Leuchten', fr: 'Lueur', es: 'Resplandor' }, durationMs: 1200 },
  'confetti': { id: 'confetti', label: { zh: '撒花', en: 'Confetti', de: 'Konfetti', fr: 'Confettis', es: 'Confeti' }, durationMs: 4500 },
  'fireworks': { id: 'fireworks', label: { zh: '烟花', en: 'Fireworks', de: 'Feuerwerk', fr: "Feux d'artifice", es: 'Fuegos artificiales' }, durationMs: 4200 },
  'sparkle': { id: 'sparkle', label: { zh: '星光', en: 'Sparkle', de: 'Funkeln', fr: 'Étincelle', es: 'Destello' }, durationMs: 2000 },
  'shake': { id: 'shake', label: { zh: '抖动', en: 'Shake', de: 'Schütteln', fr: 'Secousse', es: 'Sacudida' }, durationMs: 700 },
  'red-pulse': { id: 'red-pulse', label: { zh: '红色脉冲', en: 'Red Pulse', de: 'Roter Puls', fr: 'Pulsation rouge', es: 'Pulso rojo' }, durationMs: 900 },
  'attention-ring': { id: 'attention-ring', label: { zh: '注意环', en: 'Attention Ring', de: 'Aufmerksamkeitsring', fr: "Anneau d'attention", es: 'Anillo de atención' }, durationMs: 1200 },
  'blink': { id: 'blink', label: { zh: '闪烁', en: 'Blink', de: 'Blinken', fr: 'Clignotement', es: 'Parpadeo' }, durationMs: 900 },
};

// ---------------------------------------------------------------------------
// Scenario metadata
// ---------------------------------------------------------------------------

export const SCENARIOS: Record<FeedbackScenario, FeedbackScenarioMeta> = {
  success: {
    id: 'success',
    label: { zh: '成功', en: 'Success', de: 'Erfolg', fr: 'Succès', es: 'Éxito' },
    hint: { zh: '保存 / 新建 / 更新成功时', en: 'On save / create / update success', de: 'Bei erfolgreichem Speichern / Erstellen / Aktualisieren', fr: "Lors d'un enregistrement / création / mise à jour réussi", es: 'Al guardar / crear / actualizar con éxito' },
    styles: ['none', 'check-pulse', 'glow', 'confetti'],
    defaultStyle: 'none',
  },
  milestone: {
    id: 'milestone',
    label: { zh: '达成', en: 'Milestone', de: 'Meilenstein', fr: 'Jalon', es: 'Hito' },
    hint: { zh: '逾期清零 / 目标达成时', en: 'On clearing overdue / hitting a target', de: 'Beim Abbau von Überfälligem / Erreichen eines Ziels', fr: "À l'élimination des retards / atteinte d'un objectif", es: 'Al eliminar lo vencido / alcanzar un objetivo' },
    styles: ['none', 'confetti', 'fireworks', 'sparkle'],
    defaultStyle: 'confetti',
  },
  failure: {
    id: 'failure',
    label: { zh: '失败', en: 'Failure', de: 'Fehler', fr: 'Échec', es: 'Error' },
    hint: { zh: '操作失败 / 报错时', en: 'On a failed operation / error', de: 'Bei fehlgeschlagenem Vorgang / Fehler', fr: "Lors d'une opération échouée / erreur", es: 'En una operación fallida / error' },
    styles: ['none', 'shake', 'red-pulse'],
    defaultStyle: 'none',
  },
  warning: {
    id: 'warning',
    label: { zh: '警示', en: 'Warning', de: 'Warnung', fr: 'Avertissement', es: 'Advertencia' },
    hint: { zh: '危险确认 / 校验提示时', en: 'On a caution / validation prompt', de: 'Bei einer Warnung / Validierungsabfrage', fr: "Lors d'une mise en garde / invite de validation", es: 'En una precaución / solicitud de validación' },
    styles: ['none', 'attention-ring', 'blink'],
    defaultStyle: 'none',
  },
};

/** Ordered list for rendering the Settings section. */
export const FEEDBACK_SCENARIO_ORDER: FeedbackScenario[] = ['success', 'milestone', 'failure', 'warning'];

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const MASTER_KEY = 'feedbackAnimationsEnabled';
const scenarioKey = (s: FeedbackScenario) => `feedbackStyle:${s}`;

export const FEEDBACK_CHANGED_EVENT = 'feedback-settings-changed';

function emitChange(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FEEDBACK_CHANGED_EVENT));
}

/** Master on/off switch. Defaults to enabled. */
export function getFeedbackEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(MASTER_KEY) !== 'false';
}

export function setFeedbackEnabled(enabled: boolean): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(MASTER_KEY, enabled ? 'true' : 'false');
  }
  emitChange();
}

/** Resolve the style chosen for a scenario, falling back to its default. */
export function getScenarioStyle(scenario: FeedbackScenario): FeedbackStyleId {
  const meta = SCENARIOS[scenario];
  if (typeof localStorage === 'undefined') return meta.defaultStyle;
  const saved = localStorage.getItem(scenarioKey(scenario));
  if (saved && (meta.styles as string[]).includes(saved)) {
    return saved as FeedbackStyleId;
  }
  return meta.defaultStyle;
}

export function setScenarioStyle(scenario: FeedbackScenario, style: FeedbackStyleId): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(scenarioKey(scenario), style);
  }
  emitChange();
}

// ---------------------------------------------------------------------------
// Reduced-motion respect
// ---------------------------------------------------------------------------

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------------------
// Trigger bus — decouples "event happened" from "what plays".
// ---------------------------------------------------------------------------

export interface FeedbackEvent {
  scenario: FeedbackScenario;
  /** Resolved style at fire time (after enabled + reduced-motion gating). */
  style: FeedbackStyleId;
  /** Unique id so the host can key concurrent animations. */
  key: number;
}

type FeedbackListener = (event: FeedbackEvent) => void;

const listeners = new Set<FeedbackListener>();
let keySeq = 0;

export function subscribeFeedback(listener: FeedbackListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Request the feedback animation for a scenario. Gating (master switch,
 * per-scenario style, reduced-motion) is resolved here so callers stay simple
 * and every call site behaves consistently. No-op when nothing should play or
 * no host is mounted.
 */
export function fireFeedback(scenario: FeedbackScenario): void {
  if (!getFeedbackEnabled()) return;
  if (prefersReducedMotion()) return;
  const style = getScenarioStyle(scenario);
  if (style === 'none') return;
  const event: FeedbackEvent = { scenario, style, key: ++keySeq };
  listeners.forEach((l) => {
    try {
      l(event);
    } catch {
      /* a misbehaving listener must not break the trigger */
    }
  });
}
