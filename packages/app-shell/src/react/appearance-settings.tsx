import { useEffect, useState } from 'react';
import { Moon, Palette, Sun, Type } from 'lucide-react';
import {
  THEME_META,
  getAppearance,
  setAppearance,
  subscribeAppearance,
  type AppearancePreferences,
  type ColorTheme,
  type FontSize,
} from '../appearance';
import { PreferenceSwitch, SettingsItem } from './settings-item';

export interface AppearanceLabels {
  section: string;
  darkMode: string;
  fontSize: string;
  colorTheme: string;
  small: string;
  medium: string;
  large: string;
  themes: Record<ColorTheme, string>;
}

export const ZH_APPEARANCE_LABELS: AppearanceLabels = {
  section: '外观',
  darkMode: '深色模式',
  fontSize: '界面字体大小',
  colorTheme: '主题配色',
  small: '小',
  medium: '中',
  large: '大',
  themes: {
    sunset: '青蓝',
    ocean: '海洋',
    forest: '森林',
    berry: '浆果',
    mono: '极简',
  },
};

export function AppearanceSettings({
  labels = ZH_APPEARANCE_LABELS,
  showHeading = true,
}: {
  labels?: AppearanceLabels;
  showHeading?: boolean;
}) {
  const [preferences, setPreferences] = useState<AppearancePreferences>(getAppearance);

  useEffect(() => subscribeAppearance(setPreferences), []);

  const update = (patch: Partial<AppearancePreferences>) => {
    // Separate controls can fire before React commits the previous render.
    // Read the persisted value so a fast palette click cannot roll back a mode
    // or font-size change made a moment earlier.
    const next = { ...getAppearance(), ...patch };
    setPreferences(next);
    setAppearance(next);
  };

  return (
    <section>
      {showHeading && (
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {labels.section}
        </h2>
      )}
      <div className="as-settings-group">
        <SettingsItem
          icon={preferences.mode === 'dark' ? Moon : Sun}
          label={labels.darkMode}
          control={
            <PreferenceSwitch
              label={labels.darkMode}
              checked={preferences.mode === 'dark'}
              onChange={(checked) => update({ mode: checked ? 'dark' : 'light' })}
            />
          }
        />
        <SettingsItem
          icon={Type}
          label={labels.fontSize}
          control={
            <SegmentedFontSize
              value={preferences.fontSize}
              labels={labels}
              onChange={(fontSize) => update({ fontSize })}
            />
          }
        />
        <SettingsItem
          icon={Palette}
          label={labels.colorTheme}
          control={
            <ThemeSwatches
              value={preferences.colorTheme}
              labels={labels.themes}
              onChange={(colorTheme) => update({ colorTheme })}
            />
          }
        />
      </div>
    </section>
  );
}

function SegmentedFontSize({
  value,
  labels,
  onChange,
}: {
  value: FontSize;
  labels: AppearanceLabels;
  onChange: (value: FontSize) => void;
}) {
  const options: Array<{ value: FontSize; label: string }> = [
    { value: 'small', label: labels.small },
    { value: 'medium', label: labels.medium },
    { value: 'large', label: labels.large },
  ];
  return (
    <div className="as-segmented" role="group" aria-label={labels.fontSize}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ThemeSwatches({
  value,
  labels,
  onChange,
}: {
  value: ColorTheme;
  labels: Record<ColorTheme, string>;
  onChange: (value: ColorTheme) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {THEME_META.map((theme) => (
        <button
          key={theme.id}
          type="button"
          title={labels[theme.id]}
          aria-label={labels[theme.id]}
          aria-pressed={value === theme.id}
          onClick={() => onChange(theme.id)}
          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform ${
            value === theme.id ? 'scale-110 border-foreground' : 'border-transparent hover:scale-105'
          }`}
        >
          <span
            className="h-6 w-6 rounded-full"
            style={{ background: `linear-gradient(135deg, ${theme.colors[0]}, ${theme.colors[1]})` }}
          />
        </button>
      ))}
    </div>
  );
}
