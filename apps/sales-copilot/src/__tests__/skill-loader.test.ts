import { describe, it, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  retrieveMultipleRecordsAsync: vi.fn(),
}));

vi.mock('@microsoft/power-apps/data', () => ({
  getClient: () => mocks,
}));

import { loadSkills, invalidateSkillCache } from '@/lib/skill-loader';

describe('skill-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSkillCache();
  });

  it('parses active skills and skips inactive (statecode 1) + rows missing name or body', async () => {
    mocks.retrieveMultipleRecordsAsync.mockResolvedValue({
      success: true,
      data: [
        { skillid: '1', name: 'log-sales-activity', description: 'Record a sales activity', body: '# Skill: Log\n1. ...', statecode: 0 },
        { skillid: '2', name: '', description: 'no name', body: 'has body', statecode: 0 },
        { skillid: '3', name: 'plan', description: 'empty body', body: '   ', statecode: 0 },
        { skillid: '4', name: 'deactivated', description: 'inactive', body: '# x', statecode: 1 },
      ],
    });

    const skills = await loadSkills();

    expect(skills).toHaveLength(1);
    expect(skills[0]).toEqual({
      name: 'log-sales-activity',
      description: 'Record a sales activity',
      body: '# Skill: Log\n1. ...',
    });
  });

  it('caches: a second call does not re-query the table', async () => {
    mocks.retrieveMultipleRecordsAsync.mockResolvedValue({
      success: true,
      data: [{ skillid: '1', name: 'a', description: 'd', body: 'b', statecode: 0 }],
    });

    await loadSkills();
    await loadSkills();

    expect(mocks.retrieveMultipleRecordsAsync).toHaveBeenCalledTimes(1);
  });

  it('force re-queries after cache invalidation', async () => {
    mocks.retrieveMultipleRecordsAsync.mockResolvedValue({
      success: true,
      data: [{ skillid: '1', name: 'a', description: 'd', body: 'b', statecode: 0 }],
    });

    await loadSkills();
    invalidateSkillCache();
    await loadSkills();

    expect(mocks.retrieveMultipleRecordsAsync).toHaveBeenCalledTimes(2);
  });

  it('degrades to an empty list (never throws) when the read fails', async () => {
    mocks.retrieveMultipleRecordsAsync.mockResolvedValue({
      success: false,
      error: new Error('boom'),
    });

    const skills = await loadSkills();

    expect(skills).toEqual([]);
  });
});
