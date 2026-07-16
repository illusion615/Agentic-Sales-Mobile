import { useSyncExternalStore } from 'react';
import { getShowDataAiInsights, getAutoGenerateAiInsights } from '@/lib/i18n';

function subscribe(cb: () => void): () => void {
  window.addEventListener('aiinsights-changed', cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener('aiinsights-changed', cb);
    window.removeEventListener('storage', cb);
  };
}

/**
 * Reactive global AI-insight preferences (settings → AI assistant):
 * - showInsights: whether AI insight modules are displayed on record pages.
 * - autoGenerate: whether to auto-generate an insight when a record has none yet.
 * Backed by localStorage; updates live when toggled in settings.
 */
export function useAiInsightSettings() {
  const showInsights = useSyncExternalStore(subscribe, getShowDataAiInsights, () => true);
  const autoGenerate = useSyncExternalStore(subscribe, getAutoGenerateAiInsights, () => false);
  return { showInsights, autoGenerate };
}
