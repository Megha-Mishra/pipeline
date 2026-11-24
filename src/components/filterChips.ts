import { CLEANUP_AFTER_DAYS, type TabId } from '../view/query';

/** What removing a chip does: leave the view (back to All deals) or clear the search. The stage has its own select. */
export type ChipRemove = 'view' | 'search';

export interface FilterChip {
  name: string;
  /** Optional detail after the name, e.g. "open, closed 90+ days ago". */
  value: string | null;
  remove: ChipRemove;
}

/** Today and My deals name whose deals they hold, since that changes with "Viewing as". */
function viewChip(tab: Exclude<TabId, 'all' | 'review'>, me: string): { name: string; value: string | null } {
  switch (tab) {
    case 'today':
      return { name: 'Today', value: `${me}'s deals that need attention` };
    case 'mine':
      return { name: 'My deals', value: `${me}'s deals` };
    case 'cleanup':
      return { name: 'Quarter-end cleanup', value: `open, closed ${CLEANUP_AFTER_DAYS}+ days ago` };
  }
}

/**
 * The active filters as chips: one chip describing the view (removing it goes back to All deals),
 * then the search. The stage is chosen in its own select, so it has no chip.
 */
export function filterChips(tab: TabId, me: string, reviewLabel: string, search: string): FilterChip[] {
  const chips: FilterChip[] = [];
  if (tab === 'review') chips.push({ name: reviewLabel, value: null, remove: 'view' });
  else if (tab !== 'all') chips.push({ ...viewChip(tab, me), remove: 'view' });
  if (search) chips.push({ name: 'Search', value: `“${search}”`, remove: 'search' });
  return chips;
}
