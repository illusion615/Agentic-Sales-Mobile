import { describe, expect, it } from 'vitest';
import { detectWorkspaceLayout } from '@/hooks/use-workspace-layout';

function matcher(active: string[]) {
  return (query: string) => active.includes(query);
}

describe('detectWorkspaceLayout', () => {
  it('keeps a narrow portrait screen in the single-task layout', () => {
    expect(detectWorkspaceLayout(matcher([]))).toBe('portrait');
  });

  it('uses the desktop workspace at wide widths', () => {
    expect(detectWorkspaceLayout(matcher(['(min-width: 1200px)', '(min-width: 768px)']))).toBe('desktop');
  });

  it('prioritises physical viewport segments over width', () => {
    expect(detectWorkspaceLayout(matcher([
      '(horizontal-viewport-segments: 2), (vertical-viewport-segments: 2)',
      '(min-width: 1200px)',
      '(min-width: 768px)',
    ]))).toBe('dual');
  });
});
