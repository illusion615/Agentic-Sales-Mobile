import { describe, expect, it } from 'vitest';
import { buildSavedCardDetails, contactCardDisplayFields, formCardPrimaryText } from '@/lib/form-card-display';

describe('form-card primary text', () => {
  it('shows a contact name instead of repeating its job title', () => {
    const ethan = {
      fullName: 'Ethan Ge',
      title: 'China CIO',
      accountName: '金唯智',
    };
    expect(contactCardDisplayFields(ethan)).toEqual({
      name: 'Ethan Ge',
      title: 'China CIO',
      accountName: '金唯智',
    });
    expect(formCardPrimaryText('contact', ethan)).toBe('Ethan Ge');

    const sun = {
      fullName: 'Sun Jing',
      title: 'IT PM',
      accountName: '金唯智',
    };
    expect(contactCardDisplayFields(sun)).toEqual({
      name: 'Sun Jing',
      title: 'IT PM',
      accountName: '金唯智',
    });
    expect(formCardPrimaryText('contact', sun)).toBe('Sun Jing');
  });

  it('never substitutes a contact job title when its name is missing', () => {
    expect(formCardPrimaryText('contact', { title: 'IT PM' })).toBe('');
  });

  it('supports the legacy lowercase contact fullname field', () => {
    expect(formCardPrimaryText('contact', {
      fullname: 'Legacy Contact',
      title: 'Director',
    })).toBe('Legacy Contact');
  });

  it.each([
    ['activity', { title: 'Customer visit' }, 'Customer visit'],
    ['opportunity', { name: 'Modernization', title: 'Ignored fallback' }, 'Modernization'],
    ['account', { name: 'Contoso' }, 'Contoso'],
    ['feedback', { title: 'Contact card repeats title' }, 'Contact card repeats title'],
  ] as const)('keeps the %s primary field semantics', (type, data, expected) => {
    expect(formCardPrimaryText(type, data)).toBe(expected);
  });
});

describe('buildSavedCardDetails saved-card preview', () => {
  it('activity: identity line carries type/status/date/account; expansion carries relations + narrative', () => {
    const { summary, rows, description } = buildSavedCardDetails('activity', {
      type: 'visit',
      temporalMode: 'completed',
      scheduledDate: '2026-07-14',
      accountName: '金唯智',
      opportunityName: '新设备采购',
      attendees: [{ id: '1', fullname: '李主任' }, { id: '2', fullname: '王经理' }],
      result: '确认了本季度采购预算',
    }, 'en-US');

    // Identity line: 4 `·`-separated segments, the account anchors it (last).
    const segments = summary.split(' · ');
    expect(segments).toHaveLength(4);
    expect(segments[3]).toBe('金唯智');

    // Expansion never repeats identity fields; only relations + people appear.
    expect(rows.map((r) => r.key)).toEqual(['opportunity', 'attendees']);
    expect(rows.find((r) => r.key === 'opportunity')?.value).toBe('新设备采购');
    expect(rows.find((r) => r.key === 'attendees')?.value).toBe('李主任, 王经理');

    // The narrative renders as a paragraph, not a discrete row.
    expect(description).toBe('确认了本季度采购预算');
  });

  it('activity: calls/emails disclose a single contact instead of attendees', () => {
    const { rows } = buildSavedCardDetails('activity', {
      type: 'call',
      scheduledDate: '2026-07-14',
      contactName: '李主任',
    }, 'en-US');
    expect(rows.map((r) => r.key)).toContain('contact');
    expect(rows.find((r) => r.key === 'contact')?.value).toBe('李主任');
    expect(rows.some((r) => r.key === 'attendees')).toBe(false);
  });

  it('activity: empty relations and narrative collapse away entirely', () => {
    const { rows, description } = buildSavedCardDetails('activity', {
      type: 'visit',
      scheduledDate: '2026-07-14',
      accountName: 'Contoso',
    }, 'en-US');
    expect(rows).toHaveLength(0);
    expect(description).toBeUndefined();
  });

  it('opportunity: identity carries stage/amount/account; expansion carries close + confidence', () => {
    const { summary, rows, description } = buildSavedCardDetails('opportunity', {
      accountName: 'Contoso',
      amount: 1_500_000,
      stage: 'negotiation',
      confidence: 70,
      expectedCloseDate: '2026-09-30',
    }, 'en-US');
    expect(summary.endsWith('Contoso')).toBe(true);
    expect(summary).toMatch(/1\.5M/);
    expect(rows.map((r) => r.key)).toEqual(['close', 'confidence']);
    expect(rows.find((r) => r.key === 'confidence')?.value).toBe('70%');
    expect(description).toBeUndefined();
  });

  it('account: identity carries industry/phone; expansion carries email/address/notes', () => {
    const { summary, rows } = buildSavedCardDetails('account', {
      industry: 'Healthcare',
      phone: '010-1234',
      email: 'a@b.com',
      address: 'Beijing',
      notes: 'VIP',
    }, 'en-US');
    expect(summary).toBe('Healthcare · 010-1234');
    expect(rows.map((r) => r.key)).toEqual(['email', 'address', 'notes']);
  });

  it('contact: identity carries title/company; expansion carries phone/email; name stays in the header', () => {
    const { summary, rows } = buildSavedCardDetails('contact', {
      fullName: 'Ethan Ge',
      title: 'CIO',
      accountName: '金唯智',
      phone: '139',
      email: 'e@g.com',
    }, 'en-US');
    expect(summary).toBe('CIO · 金唯智');
    expect(summary).not.toContain('Ethan Ge');
    expect(rows.map((r) => r.key)).toEqual(['phone', 'email']);
  });

  it('feedback: keeps its structured bug/enhancement fields', () => {
    const { rows } = buildSavedCardDetails('feedback', {
      feedbackType: 'bug',
      description: 'crash',
      expectedOutcome: 'no crash',
      reproductionSteps: 'open app',
    }, 'en-US');
    expect(rows.map((r) => r.key)).toEqual(['feedbackDetail', 'expectedOutcome', 'reproductionSteps']);
  });
});