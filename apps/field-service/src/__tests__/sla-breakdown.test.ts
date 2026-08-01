import { describe, expect, it } from 'vitest';
import { slaBreakdown } from '@/domain/scheduling';

const NOW = new Date('2026-08-01T09:00:00.000Z');
const inMinutes = (minutes: number) =>
  new Date(NOW.getTime() + minutes * 60_000).toISOString();

describe('slaBreakdown', () => {
  it('counts every state the legend can show', () => {
    const counts = slaBreakdown(
      [
        { slaDueBy: inMinutes(-30) },
        { slaDueBy: inMinutes(60) },
        { slaDueBy: inMinutes(300) },
        { slaDueBy: inMinutes(900) },
        { slaDueBy: undefined },
      ],
      NOW,
    );

    expect(counts).toEqual({ breached: 1, critical: 1, 'at-risk': 1, ok: 1, none: 1 });
  });

  it('reports zeros for an empty day rather than an empty object', () => {
    expect(slaBreakdown([], NOW)).toEqual({
      breached: 0,
      critical: 0,
      'at-risk': 0,
      ok: 0,
      none: 0,
    });
  });

  it('totals to the number of jobs, so the legend can never over- or under-count', () => {
    const jobs = [
      { slaDueBy: inMinutes(-1) },
      { slaDueBy: inMinutes(-1) },
      { slaDueBy: inMinutes(119) },
      { slaDueBy: inMinutes(479) },
      { slaDueBy: inMinutes(481) },
    ];
    const counts = slaBreakdown(jobs, NOW);

    expect(Object.values(counts).reduce((sum, n) => sum + n, 0)).toBe(jobs.length);
  });

  it('places a job exactly on a threshold in the less urgent band', () => {
    expect(slaBreakdown([{ slaDueBy: inMinutes(120) }], NOW)['at-risk']).toBe(1);
    expect(slaBreakdown([{ slaDueBy: inMinutes(480) }], NOW).ok).toBe(1);
  });
});
