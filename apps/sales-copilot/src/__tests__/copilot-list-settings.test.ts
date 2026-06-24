import { beforeEach, describe, expect, it } from 'vitest';
import {
  getCopilotListDefaultView,
  setCopilotListDefaultView,
  getCopilotListTopN,
  setCopilotListTopN,
} from '@/lib/i18n';

describe('copilot list display settings', () => {
  beforeEach(() => {
    localStorage.removeItem('copilotListDefaultView');
    localStorage.removeItem('copilotListTopN');
  });

  it('defaults to expanded list view', () => {
    expect(getCopilotListDefaultView()).toBe('expanded');
  });

  it('stores and reads collapsed list view', () => {
    setCopilotListDefaultView('collapsed');
    expect(getCopilotListDefaultView()).toBe('collapsed');
  });

  it('defaults topN to 3', () => {
    expect(getCopilotListTopN()).toBe(3);
  });

  it('stores topN and clamps out-of-range values', () => {
    setCopilotListTopN(10);
    expect(getCopilotListTopN()).toBe(10);

    setCopilotListTopN(0);
    expect(getCopilotListTopN()).toBe(1);

    setCopilotListTopN(999);
    expect(getCopilotListTopN()).toBe(50);
  });

  it('falls back to default when localStorage value is invalid', () => {
    localStorage.setItem('copilotListTopN', 'not-a-number');
    expect(getCopilotListTopN()).toBe(3);
  });
});
