import { describe, expect, it } from 'vitest';
import {
  activityDraftDateLabelKey,
  activityDraftDetailsPlaceholderKey,
  activityDraftModeLabelKey,
  activityStatusForDraftMode,
  resolveActivityDraftMode,
  temporalModeFromFrame,
} from '@/lib/activity-draft-mode';

const TODAY = new Date(2026, 6, 15, 12, 0);

describe('activity draft mode', () => {
  it('maps explicit Frame tense to the canonical temporal signal', () => {
    expect(temporalModeFromFrame('past')).toBe('completed');
    expect(temporalModeFromFrame('future')).toBe('planned');
    expect(temporalModeFromFrame('none')).toBe('unspecified');
    expect(temporalModeFromFrame(undefined)).toBe('unspecified');
  });

  it('keeps explicit semantic mode ahead of a conflicting date', () => {
    expect(resolveActivityDraftMode({
      temporalMode: 'completed',
      scheduledDate: '2026-07-20',
      today: TODAY,
    })).toBe('completed');
    expect(resolveActivityDraftMode({
      temporalMode: 'planned',
      scheduledDate: '2026-07-10',
      today: TODAY,
    })).toBe('planned');
  });

  it('falls back from unspecified mode to past-date completed and today/future planned', () => {
    expect(resolveActivityDraftMode({
      temporalMode: 'unspecified',
      scheduledDate: '2026-07-14',
      today: TODAY,
    })).toBe('completed');
    expect(resolveActivityDraftMode({
      temporalMode: 'unspecified',
      scheduledDate: '2026-07-15',
      today: TODAY,
    })).toBe('planned');
    expect(resolveActivityDraftMode({
      temporalMode: 'unspecified',
      scheduledDate: '2026-07-16',
      today: TODAY,
    })).toBe('planned');
  });

  it('defaults missing or invalid legacy values conservatively to planned', () => {
    expect(resolveActivityDraftMode({ today: TODAY })).toBe('planned');
    expect(resolveActivityDraftMode({ temporalMode: 'legacy', scheduledDate: 'invalid', today: TODAY })).toBe('planned');
  });

  it('maps the selected mode to native activity status and UI wording', () => {
    expect(activityStatusForDraftMode('planned')).toBe('open');
    expect(activityStatusForDraftMode('completed')).toBe('completed');
    expect(activityDraftModeLabelKey('planned')).toBe('statusPlanned');
    expect(activityDraftModeLabelKey('completed')).toBe('statusCompleted');
    expect(activityDraftDateLabelKey('planned')).toBe('fieldScheduled');
    expect(activityDraftDateLabelKey('completed')).toBe('fieldDate');
    expect(activityDraftDetailsPlaceholderKey('planned')).toBe('detailsPlaceholderUpcoming');
    expect(activityDraftDetailsPlaceholderKey('completed')).toBe('detailsPlaceholderPast');
  });
});