export type AppearanceMode = 'light' | 'dark';
export type ColorTheme = 'sunset' | 'ocean' | 'forest' | 'berry' | 'mono';
export type FontSize = 'small' | 'medium' | 'large';

export interface AppearancePreferences {
  mode: AppearanceMode;
  colorTheme: ColorTheme;
  fontSize: FontSize;
}

export interface ThemeMeta {
  id: ColorTheme;
  colors: readonly [string, string];
}

export const THEME_META: readonly ThemeMeta[] = [
  { id: 'sunset', colors: ['#008a7a', '#2d6cdf'] },
  { id: 'ocean', colors: ['#0ea5e9', '#8b5cf6'] },
  { id: 'forest', colors: ['#22c55e', '#f97316'] },
  { id: 'berry', colors: ['#ec4899', '#6366f1'] },
  { id: 'mono', colors: ['#71717a', '#18181b'] },
];

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  mode: 'light',
  colorTheme: 'sunset',
  fontSize: 'medium',
};

const CHANGE_EVENT = 'agentic-appearance-changed';
const COLOR_THEMES = new Set<ColorTheme>(THEME_META.map((theme) => theme.id));
const FONT_SIZES = new Set<FontSize>(['small', 'medium', 'large']);
const ROOT_FONT_PX: Record<FontSize, string> = { small: '14px', medium: '16px', large: '18px' };
const TYPOGRAPHY: Record<FontSize, { title: string; body: string; helper: string }> = {
  small: { title: '0.875rem', body: '0.8125rem', helper: '0.75rem' },
  medium: { title: '1rem', body: '0.875rem', helper: '0.8125rem' },
  large: { title: '1.125rem', body: '1rem', helper: '0.875rem' },
};

interface AppearanceScope {
  id: string;
  migrateLegacy: boolean;
}

let scope: AppearanceScope = { id: 'default', migrateLegacy: false };

/**
 * Configure once, before initialisation. Code apps can share an origin, so the
 * component is shared but each app's preference must have its own key.
 */
export function configureAppearanceScope(id: string, options?: { migrateLegacy?: boolean }): void {
  const normalised = id.trim().replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  scope = { id: normalised || 'default', migrateLegacy: options?.migrateLegacy === true };
}

function storageKey(): string {
  return `agentic-appearance:${scope.id}:v1`;
}

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function valid(value: unknown): AppearancePreferences | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<AppearancePreferences>;
  if (raw.mode !== 'light' && raw.mode !== 'dark') return null;
  if (!raw.colorTheme || !COLOR_THEMES.has(raw.colorTheme)) return null;
  if (!raw.fontSize || !FONT_SIZES.has(raw.fontSize)) return null;
  return raw as AppearancePreferences;
}

/** Migrate the three settings the Sales app stored before the family shell existed. */
function legacyPreferences(store: Storage): AppearancePreferences {
  const mode = store.getItem('theme') === 'dark' ? 'dark' : 'light';
  const legacyTheme = store.getItem('colorTheme') as ColorTheme | null;
  let fontSize: FontSize = DEFAULT_APPEARANCE.fontSize;
  try {
    const config = JSON.parse(store.getItem('fontSizeConfig') ?? '{}') as { ui?: FontSize };
    if (config.ui && FONT_SIZES.has(config.ui)) fontSize = config.ui;
  } catch {
    /* invalid legacy setting — use the default */
  }
  return {
    mode,
    colorTheme: legacyTheme && COLOR_THEMES.has(legacyTheme) ? legacyTheme : DEFAULT_APPEARANCE.colorTheme,
    fontSize,
  };
}

export function getAppearance(): AppearancePreferences {
  const store = storage();
  if (!store) return DEFAULT_APPEARANCE;
  try {
    const saved = valid(JSON.parse(store.getItem(storageKey()) ?? 'null'));
    if (saved) return saved;
  } catch {
    /* invalid current setting — migrate or use defaults */
  }
  return scope.migrateLegacy ? legacyPreferences(store) : DEFAULT_APPEARANCE;
}

export function applyAppearance(preferences: AppearancePreferences): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(preferences.mode);
  root.dataset.theme = preferences.colorTheme;

  const type = TYPOGRAPHY[preferences.fontSize];
  root.style.fontSize = ROOT_FONT_PX[preferences.fontSize];
  root.style.setProperty('--scm-font-title', type.title);
  root.style.setProperty('--scm-font-body', type.body);
  root.style.setProperty('--scm-font-helper', type.helper);
}

export function setAppearance(preferences: AppearancePreferences): void {
  const store = storage();
  store?.setItem(storageKey(), JSON.stringify(preferences));
  applyAppearance(preferences);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<AppearancePreferences>(CHANGE_EVENT, { detail: preferences }));
  }
}

export function updateAppearance(patch: Partial<AppearancePreferences>): AppearancePreferences {
  const next = { ...getAppearance(), ...patch };
  setAppearance(next);
  return next;
}

/** Apply the stored preferences before first paint. */
export function initAppearance(): AppearancePreferences {
  const preferences = getAppearance();
  setAppearance(preferences);
  return preferences;
}

export function subscribeAppearance(listener: (preferences: AppearancePreferences) => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const key = storageKey();
  const onChange = (event: Event) => listener((event as CustomEvent<AppearancePreferences>).detail);
  const onStorage = (event: StorageEvent) => {
    if (event.key === key) listener(getAppearance());
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}
