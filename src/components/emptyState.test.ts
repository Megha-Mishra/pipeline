import { describe, expect, it } from 'vitest';
import { emptyStateFor } from './emptyState';

const NO_FILTERS = { owner: null, closeFrom: null, closeTo: null };

describe('emptyStateFor', () => {
  it('offers to clear the search when a search is active, whatever else is set', () => {
    const s = emptyStateFor({ tab: 'all', stage: 'Won', search: 'acme', ...NO_FILTERS });
    expect(s.message).toBe('No deals in All deals at Won match “acme”.');
    expect(s.action?.kind).toBe('clear-search');
  });

  it('offers to show all stages when only a stage filter hides everything', () => {
    const s = emptyStateFor({ tab: 'today', stage: 'Negotiation', search: '', ...NO_FILTERS });
    expect(s.message).toBe('No Negotiation deals in Today.');
    expect(s.action?.kind).toBe('show-all-stages');
  });

  it('gives each view its own message', () => {
    expect(emptyStateFor({ tab: 'today', stage: null, search: '', ...NO_FILTERS }).action?.kind).toBe('go-mine');
    expect(emptyStateFor({ tab: 'cleanup', stage: null, search: '', ...NO_FILTERS }).message).toContain('90 days past their close date');
    expect(emptyStateFor({ tab: 'review', stage: null, search: '', ...NO_FILTERS }).action?.kind).toBe('close-review');
    expect(emptyStateFor({ tab: 'all', stage: null, search: '', ...NO_FILTERS }).action).toBeUndefined();
  });

  it('offers to clear owner or date filters when they hide everything', () => {
    const s = emptyStateFor({ tab: 'today', stage: null, search: '', owner: null, closeFrom: 0, closeTo: 1 });
    expect(s.message).toBe('No deals in Today match these filters.');
    expect(s.action?.kind).toBe('clear-filters');
  });
});
