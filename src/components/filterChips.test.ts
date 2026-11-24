import { describe, expect, it } from 'vitest';
import { filterChips } from './filterChips';

const ME = 'Priya Sharma';
const labels = (tab: Parameters<typeof filterChips>[0], reviewLabel = '', search = '') =>
  filterChips(tab, ME, reviewLabel, search).map((c) => `${c.name}${c.value ? `: ${c.value}` : ''} [${c.remove}]`);

describe('filterChips', () => {
  it('describes each view with one chip, naming whose deals Today and My deals hold', () => {
    expect(labels('today')).toEqual(["Today: Priya Sharma's deals that need attention [view]"]);
    expect(labels('mine')).toEqual(["My deals: Priya Sharma's deals [view]"]);
    expect(labels('cleanup')).toEqual(['Quarter-end cleanup: open, closed 90+ days ago [view]']);
    expect(labels('review', 'Skipped in bulk move (3)')).toEqual(['Skipped in bulk move (3) [view]']);
  });

  it('adds the search as its own chip', () => {
    expect(labels('cleanup', '', 'acme')).toEqual(['Quarter-end cleanup: open, closed 90+ days ago [view]', 'Search: “acme” [search]']);
  });

  it('shows nothing for All deals without a search', () => {
    expect(labels('all')).toEqual([]);
  });
});
