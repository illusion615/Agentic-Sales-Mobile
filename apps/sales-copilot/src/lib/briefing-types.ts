// BriefMe payload types

export type BriefingPriority = 'focus' | 'opp' | 'risk' | 'warn' | 'info';
export type MetricDirection = 'up' | 'down' | 'flat';

export interface BilingualText {
  zh: string;
  en: string;
}

export interface TimeRange {
  start_ms: number;
  end_ms: number;
}

export interface BriefingMetric {
  label: BilingualText;
  value: string;
  dir: MetricDirection;
}

export interface BriefingCTA {
  label: BilingualText;
  action: string;
  target?: string;
}

export interface BriefingItem {
  id: string;
  priority: BriefingPriority;
  pos: {
    index: number;
    total: number;
  };
  time_range: TimeRange;
  headline: BilingualText;
  summary: BilingualText;
  script?: BilingualText; // Detailed voice-over script for TTS (more conversational than summary)
  context?: BilingualText;
  bullets?: BilingualText[];
  metrics?: BriefingMetric[];
  cta?: BriefingCTA;
}

export interface BriefingPayload {
  items: BriefingItem[];
}

// Priority color mapping
export const priorityColors: Record<BriefingPriority, { bg: string; border: string; text: string; dot: string }> = {
  focus: {
    bg: 'rgba(255, 122, 0, 0.12)',
    border: 'rgba(255, 122, 0, 0.3)',
    text: '#FF9933',
    dot: '#FF7A00',
  },
  opp: {
    bg: 'rgba(13, 143, 140, 0.12)',
    border: 'rgba(13, 143, 140, 0.3)',
    text: '#14B8B4',
    dot: '#0D8F8C',
  },
  risk: {
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.3)',
    text: '#F87171',
    dot: '#EF4444',
  },
  warn: {
    bg: 'rgba(245, 158, 11, 0.12)',
    border: 'rgba(245, 158, 11, 0.3)',
    text: '#FBBF24',
    dot: '#F59E0B',
  },
  info: {
    bg: 'rgba(99, 102, 241, 0.12)',
    border: 'rgba(99, 102, 241, 0.3)',
    text: '#818CF8',
    dot: '#6366F1',
  },
};

// Parse payload JSON from Briefing table
export function parseBriefingPayload(jsonStr: string): BriefingPayload | null {
  try {
    const raw = JSON.parse(jsonStr);
    if (!raw.items || !Array.isArray(raw.items)) return null;
    
    // Normalize the payload structure (handle legacy format)
    const items: BriefingItem[] = raw.items.map((item: Record<string, unknown>, idx: number) => {
      const typeToP: Record<string, BriefingPriority> = {
        focus: 'focus',
        opportunity: 'opp',
        risk: 'risk',
        action: 'warn',
        insight: 'info',
        preview: 'info',
      };
      
      const itemType = item.type as string || 'info';
      const priority: BriefingPriority = typeToP[itemType] || 'info';
      
      // Handle time ranges - legacy format uses timeRange with start/end in seconds
      const tr = item.timeRange as { start?: number; end?: number } | undefined;
      const timeRange: TimeRange = {
        start_ms: (tr?.start ?? idx * 25) * 1000,
        end_ms: (tr?.end ?? (idx + 1) * 25) * 1000,
      };
      
      return {
        id: (item.id as string) || `item-${idx}`,
        priority,
        pos: { index: idx + 1, total: raw.items.length },
        time_range: timeRange,
        headline: {
          zh: (item.title_zh as string) || (item.title as string) || '',
          en: (item.title as string) || '',
        },
        summary: {
          zh: (item.summary_zh as string) || (item.summary as string) || '',
          en: (item.summary as string) || '',
        },
        script: item.script ? {
          zh: (item.script as { zh?: string })?.zh || (item.script_zh as string) || '',
          en: (item.script as { en?: string })?.en || (item.script as string) || '',
        } : (item.script_zh || item.script_en) ? {
          zh: (item.script_zh as string) || '',
          en: (item.script_en as string) || '',
        } : undefined,
        context: item.context ? {
          zh: (item.context as { zh?: string })?.zh || '',
          en: (item.context as { en?: string })?.en || '',
        } : undefined,
        bullets: Array.isArray(item.bullets) ? item.bullets.map((b: string, i: number) => ({
          zh: Array.isArray(item.bullets_zh) ? (item.bullets_zh as string[])[i] || b : b,
          en: b,
        })) : undefined,
        metrics: Array.isArray(item.metrics) ? (item.metrics as Array<Record<string, unknown>>).map((m) => ({
          label: {
            zh: (m.label_zh as string) || (m.label as string) || '',
            en: (m.label as string) || '',
          },
          value: (m.value as string) || '',
          dir: (m.direction as MetricDirection) || 'flat',
        })) : undefined,
        cta: item.cta ? {
          label: {
            zh: ((item.cta as Record<string, unknown>).label_zh as string) || ((item.cta as Record<string, unknown>).label as string) || '',
            en: ((item.cta as Record<string, unknown>).label as string) || '',
          },
          action: ((item.cta as Record<string, unknown>).action as string) || '',
          target: ((item.cta as Record<string, unknown>).target as string) || undefined,
        } : undefined,
      };
    });
    
    return { items };
  } catch {
    return null;
  }
}
