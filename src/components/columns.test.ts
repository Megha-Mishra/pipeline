import { describe, expect, it } from 'vitest';
import { pickColumns } from './columns';

const keys = (tab: Parameters<typeof pickColumns>[0], width: number) => pickColumns(tab, width).columns.map((c) => c.key);

describe('pickColumns', () => {
  it('shows every column when there is room', () => {
    expect(keys('all', 1400)).toEqual(['select', 'deal', 'owner', 'stage', 'value', 'close', 'status']);
  });

  it('adds Why today and leaves out Owner in Today, since every deal there is the viewer\'s', () => {
    expect(keys('today', 1400)).toEqual(['select', 'deal', 'reason', 'stage', 'value', 'close', 'status']);
    expect(keys('mine', 1400)).not.toContain('owner');
  });

  it('adds Overdue in Quarter-end cleanup', () => {
    expect(keys('cleanup', 1400)).toEqual(['select', 'deal', 'owner', 'stage', 'value', 'close', 'overdue', 'status']);
  });

  it('hides Close date first when space runs out', () => {
    // A 1280 px window with the Simulation panel open leaves about 1000 px for the table.
    expect(keys('cleanup', 1000)).toEqual(['select', 'deal', 'owner', 'stage', 'value', 'overdue', 'status']);
    expect(keys('today', 1000)).toEqual(['select', 'deal', 'reason', 'stage', 'value', 'status']);
    expect(keys('all', 1000)).toEqual(['select', 'deal', 'owner', 'stage', 'value', 'close', 'status']);
  });

  it('never hides deal, stage or status, and falls back to sideways scroll', () => {
    const layout = pickColumns('all', 300);
    expect(layout.columns.map((c) => c.key)).toEqual(['select', 'deal', 'stage', 'status']);
    expect(layout.minWidth).toBeGreaterThan(300);
  });

  it('fits within the width it was given whenever it can', () => {
    for (const width of [1230, 1100, 1000, 900]) {
      for (const tab of ['today', 'mine', 'all', 'cleanup'] as const) {
        const layout = pickColumns(tab, width);
        if (layout.columns.some((c) => c.key === 'value')) expect(layout.minWidth).toBeLessThanOrEqual(width);
      }
    }
  });

  it('returns the same object for the same column set, so memoised rows stay put on resize', () => {
    expect(pickColumns('all', 1400)).toBe(pickColumns('all', 1500));
  });
});
