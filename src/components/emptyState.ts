import { CLEANUP_AFTER_DAYS, type TabId, type ViewQuery } from '../view/query';

export type EmptyAction = 'clear-search' | 'clear-filters' | 'show-all-stages' | 'go-mine' | 'close-review';

export interface EmptyState {
  message: string;
  action?: { kind: EmptyAction; label: string };
}

const TAB_NAMES: Record<TabId, string> = {
  today: 'Today',
  mine: 'My deals',
  all: 'All deals',
  cleanup: 'Quarter-end cleanup',
  review: 'this review list',
};

/** What to say when a view has no rows, and the one action most likely to help. The narrowest filter wins. */
export function emptyStateFor(query: Pick<ViewQuery, 'tab' | 'stage' | 'search' | 'owner' | 'closeFrom' | 'closeTo'>): EmptyState {
  const where = TAB_NAMES[query.tab];
  if (query.search) {
    return {
      message: `No deals in ${where}${query.stage ? ` at ${query.stage}` : ''} match “${query.search}”.`,
      action: { kind: 'clear-search', label: 'Clear search' },
    };
  }
  if (query.owner || query.closeFrom !== null || query.closeTo !== null) {
    return { message: `No deals in ${where} match these filters.`, action: { kind: 'clear-filters', label: 'Clear filters' } };
  }
  if (query.stage) {
    return { message: `No ${query.stage} deals in ${where}.`, action: { kind: 'show-all-stages', label: 'Show all stages' } };
  }
  switch (query.tab) {
    case 'today':
      return { message: 'Nothing needs your attention today.', action: { kind: 'go-mine', label: 'Go to My deals' } };
    case 'mine':
      return { message: 'You have no deals. Switch "Viewing as" to see a teammate’s.' };
    case 'cleanup':
      return { message: `No open deals are more than ${CLEANUP_AFTER_DAYS} days past their close date.` };
    case 'review':
      return { message: 'No deals left to review.', action: { kind: 'close-review', label: 'Close review' } };
    case 'all':
      return { message: 'There are no deals in the pipeline.' };
  }
}
