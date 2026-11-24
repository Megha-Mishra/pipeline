import { DAY, startOfDay } from '../domain/dates';
import { prioritize, type Priority } from '../domain/priority';
import { STAGES, isOpenStage, stageIndex, type Deal, type Stage } from '../domain/types';

export type TabId = 'today' | 'mine' | 'all' | 'cleanup' | 'review';
export type SortKey = 'priority' | 'company' | 'value' | 'stage' | 'owner' | 'closeDate' | 'lastActivity';
export type SortDir = 'asc' | 'desc';

export interface ViewQuery {
  tab: TabId;
  stage: Stage | null;
  search: string;
  sortKey: SortKey;
  sortDir: SortDir;
  /** Deal IDs for the temporary "Review" tab (e.g. bulk conflicts). */
  reviewIds: readonly string[];
  reviewLabel: string;
  /** Only deals owned by this person, or null for anyone. */
  owner: string | null;
  /** Close date range, inclusive, as timestamps (start of the first day, end of the last); null leaves that end open. */
  closeFrom: number | null;
  closeTo: number | null;
}

export interface ViewContext {
  me: string;
  now: number;
}

export interface DealSource {
  forEachDisplayDeal(callback: (deal: Deal) => void): void;
}

export const CLEANUP_AFTER_DAYS = 90;

export function defaultSort(tab: TabId): { sortKey: SortKey; sortDir: SortDir } {
  switch (tab) {
    case 'today':
      return { sortKey: 'priority', sortDir: 'desc' };
    case 'cleanup':
      return { sortKey: 'closeDate', sortDir: 'asc' };
    default:
      return { sortKey: 'lastActivity', sortDir: 'desc' };
  }
}

const searchText = new WeakMap<Deal, string>();
function haystack(deal: Deal): string {
  let text = searchText.get(deal);
  if (text === undefined) {
    text = `${deal.company} ${deal.city} ${deal.owner} ${deal.id}`.toLowerCase();
    searchText.set(deal, text);
  }
  return text;
}

interface Classified {
  mine: boolean;
  today: Priority | null;
  cleanup: boolean;
}

function classify(deal: Deal, ctx: ViewContext): Classified {
  const mine = deal.owner === ctx.me;
  return {
    mine,
    today: mine ? prioritize(deal, ctx.now, ctx.me) : null,
    cleanup: isOpenStage(deal.stage) && deal.closeDate < startOfDay(ctx.now) - CLEANUP_AFTER_DAYS * DAY,
  };
}

function inTab(tab: TabId, c: Classified, deal: Deal, review: ReadonlySet<string>): boolean {
  switch (tab) {
    case 'today':
      return c.today !== null;
    case 'mine':
      return c.mine;
    case 'cleanup':
      return c.cleanup;
    case 'review':
      return review.has(deal.id);
    case 'all':
      return true;
  }
}

/** Filters that narrow every view alike (search, owner, close date). The stage filter is separate because the stage counts ignore it. */
function passesFilters(deal: Deal, q: ViewQuery, needle: string, checkOwner = true): boolean {
  if (needle && !haystack(deal).includes(needle)) return false;
  if (checkOwner && q.owner && deal.owner !== q.owner) return false;
  if (q.closeFrom !== null && deal.closeDate < q.closeFrom) return false;
  if (q.closeTo !== null && deal.closeDate > q.closeTo) return false;
  return true;
}

/** Does one deal belong in the current view? Used to dim rows that have left it. */
export function matchesQuery(deal: Deal, q: ViewQuery, ctx: ViewContext): boolean {
  if (q.stage && deal.stage !== q.stage) return false;
  if (!passesFilters(deal, q, q.search.trim().toLowerCase())) return false;
  return inTab(q.tab, classify(deal, ctx), deal, new Set(q.reviewIds));
}

export interface ViewResult {
  ids: string[];
  priorities: Map<string, Priority>;
}

/** Filters and sorts all deals for the current view. One pass over 50k deals. */
export function computeView(source: DealSource, q: ViewQuery, ctx: ViewContext): ViewResult {
  const needle = q.search.trim().toLowerCase();
  const review = new Set(q.reviewIds);
  const rows: Deal[] = [];
  const priorities = new Map<string, Priority>();
  source.forEachDisplayDeal((deal) => {
    if (q.stage && deal.stage !== q.stage) return;
    if (!passesFilters(deal, q, needle)) return;
    const c = classify(deal, ctx);
    if (!inTab(q.tab, c, deal, review)) return;
    rows.push(deal);
    if (c.today) priorities.set(deal.id, c.today);
  });
  rows.sort(comparator(q, priorities));
  return { ids: rows.map((d) => d.id), priorities };
}

export interface ViewStats {
  /** Deals per stage in the current tab, search, owner and close-date filters, ignoring the stage filter. */
  stageCounts: Record<Stage, number>;
  tabCounts: Record<TabId, number>;
  /** Deals matching the full query, including the stage filter. */
  matching: number;
}

export function computeStats(source: DealSource, q: ViewQuery, ctx: ViewContext): ViewStats {
  const needle = q.search.trim().toLowerCase();
  const review = new Set(q.reviewIds);
  const stageCounts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  const tabCounts: Record<TabId, number> = { today: 0, mine: 0, all: 0, cleanup: 0, review: 0 };
  let matching = 0;
  source.forEachDisplayDeal((deal) => {
    if (!passesFilters(deal, q, needle, false)) return;
    const c = classify(deal, ctx);
    // Today and My deals drop the owner filter when opened, so their counts ignore it too.
    if (c.mine) tabCounts.mine++;
    if (c.today) tabCounts.today++;
    if (q.owner && deal.owner !== q.owner) return;
    tabCounts.all++;
    if (c.cleanup) tabCounts.cleanup++;
    if (review.has(deal.id)) tabCounts.review++;
    if (!inTab(q.tab, c, deal, review)) return;
    stageCounts[deal.stage]++;
    if (!q.stage || deal.stage === q.stage) matching++;
  });
  return { stageCounts, tabCounts, matching };
}

/** IDs matching the query right now, unsorted. Used when "select all matching" is executed. */
export function collectMatchingIds(source: DealSource, q: ViewQuery, ctx: ViewContext): string[] {
  const ids: string[] = [];
  const needle = q.search.trim().toLowerCase();
  const review = new Set(q.reviewIds);
  source.forEachDisplayDeal((deal) => {
    if (q.stage && deal.stage !== q.stage) return;
    if (!passesFilters(deal, q, needle)) return;
    if (inTab(q.tab, classify(deal, ctx), deal, review)) ids.push(deal.id);
  });
  return ids;
}

function comparator(q: ViewQuery, priorities: Map<string, Priority>): (a: Deal, b: Deal) => number {
  const dir = q.sortDir === 'asc' ? 1 : -1;
  const value = (d: Deal): number | string => {
    switch (q.sortKey) {
      case 'priority':
        return priorities.get(d.id)?.score ?? 0;
      case 'company':
        return d.company;
      case 'value':
        return d.value;
      case 'stage':
        return stageIndex(d.stage);
      case 'owner':
        return d.owner;
      case 'closeDate':
        return d.closeDate;
      case 'lastActivity':
        return d.lastActivityAt;
    }
  };
  return (a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return a.id < b.id ? -1 : 1;
  };
}
