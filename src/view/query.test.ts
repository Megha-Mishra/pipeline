import { describe, expect, it } from 'vitest';
import type { Deal } from '../domain/types';
import { makeDeal, ME, NOW } from '../test/helpers';
import { collectMatchingIds, computeStats, computeView, defaultSort, matchesQuery, type DealSource, type ViewQuery } from './query';

const DAY = 86_400_000;
const source = (deals: Deal[]): DealSource => ({ forEachDisplayDeal: (cb) => deals.forEach(cb) });
const ctx = { me: ME, now: NOW };
const query = (patch: Partial<ViewQuery> = {}): ViewQuery => ({
  tab: 'all',
  stage: null,
  search: '',
  ...defaultSort('all'),
  reviewIds: [],
  reviewLabel: '',
  owner: null,
  closeFrom: null,
  closeTo: null,
  ...patch,
});

const deals = [
  makeDeal('D-1', { owner: 'Ravi Kumar', closeDate: NOW + 5 * DAY, stage: 'Contacted' }),
  makeDeal('D-2', { owner: 'Ravi Kumar', closeDate: NOW + 40 * DAY, stage: 'Negotiation' }),
  makeDeal('D-3', { owner: ME, closeDate: NOW + 5 * DAY, stage: 'Contacted' }),
];

describe('owner and close-date filters', () => {
  it('filters rows by owner', () => {
    expect(computeView(source(deals), query({ owner: 'Ravi Kumar' }), ctx).ids.sort()).toEqual(['D-1', 'D-2']);
  });

  it('filters rows by an inclusive close-date range, with either end open', () => {
    const range = { closeFrom: NOW, closeTo: NOW + 10 * DAY };
    expect(computeView(source(deals), query(range), ctx).ids.sort()).toEqual(['D-1', 'D-3']);
    expect(computeView(source(deals), query({ closeFrom: NOW + 30 * DAY }), ctx).ids).toEqual(['D-2']);
    expect(computeView(source(deals), query({ closeTo: NOW + 5 * DAY }), ctx).ids.sort()).toEqual(['D-1', 'D-3']);
  });

  it('applies the same filters to "select all matching", so a bulk move never reaches hidden deals', () => {
    expect(collectMatchingIds(source(deals), query({ owner: 'Ravi Kumar', closeTo: NOW + 10 * DAY }), ctx)).toEqual(['D-1']);
  });

  it('applies them to the counts, and to the check that dims rows that left the view', () => {
    const stats = computeStats(source(deals), query({ owner: 'Ravi Kumar' }), ctx);
    expect(stats.matching).toBe(2);
    expect(stats.tabCounts.all).toBe(2);
    expect(stats.stageCounts.Contacted).toBe(1);
    // My deals and Today clear the owner filter when opened, so their counts don't apply it.
    expect(stats.tabCounts.mine).toBe(1);
    expect(matchesQuery(deals[2], query({ owner: 'Ravi Kumar' }), ctx)).toBe(false);
    expect(matchesQuery(deals[0], query({ owner: 'Ravi Kumar' }), ctx)).toBe(true);
  });
});
