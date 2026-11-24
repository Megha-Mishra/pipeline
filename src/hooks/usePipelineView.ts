import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Stage } from '../domain/types';
import type { PipelineEngine } from '../sync/engine';
import {
  collectMatchingIds,
  computeStats,
  computeView,
  defaultSort,
  matchesQuery,
  type SortKey,
  type TabId,
  type ViewContext,
  type ViewQuery,
  type ViewResult,
} from '../view/query';

const EMPTY_RESULT: ViewResult = { ids: [], priorities: new Map() };

/**
 * Owns the filter/sort state and a *frozen* row order. Live data still flows
 * into rows, but rows only re-sort when the user changes the view or clicks
 * "Refresh order", so deals never jump under the cursor.
 */
export function usePipelineView(engine: PipelineEngine, version: number) {
  const [query, setQuery] = useState<ViewQuery>({
    tab: 'today',
    stage: null,
    search: '',
    ...defaultSort('today'),
    reviewIds: [],
    reviewLabel: '',
    owner: null,
    closeFrom: null,
    closeTo: null,
  });
  const [refreshKey, setRefreshKey] = useState(0);
  const search = useDeferredValue(query.search);
  const effective = useMemo(() => ({ ...query, search }), [query, search]);
  const me = engine.me;
  const loaded = engine.loaded;

  const ctx: ViewContext = useMemo(
    () => ({ me, now: Date.now() }),
    // A new "now" each time the order is rebuilt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [me, refreshKey, effective],
  );

  const snapshot = useMemo(
    () => (loaded ? computeView(engine, effective, ctx) : EMPTY_RESULT),
    [engine, effective, ctx, loaded],
  );

  // Counts are live, but computed at low priority so typing and scrolling stay smooth.
  const deferredVersion = useDeferredValue(version);
  const stats = useMemo(
    () => computeStats(engine, effective, ctx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, effective, ctx, deferredVersion],
  );

  const [pendingChanges, setPendingChanges] = useState(0);
  useEffect(() => {
    setPendingChanges(0);
    const inSnapshot = new Set(snapshot.ids);
    const changed = new Set<string>();
    return engine.onDealsChanged((ids) => {
      const before = changed.size;
      for (const id of ids) {
        const row = engine.getRow(id);
        if (row && (inSnapshot.has(id) || matchesQuery(row.deal, effective, ctx))) changed.add(id);
      }
      if (changed.size !== before) setPendingChanges(changed.size);
    });
  }, [engine, snapshot, effective, ctx]);

  // Simulated teammates prefer deals the user can see, so live updates are visible in a demo.
  useEffect(() => {
    engine.server.setHotIds(snapshot.ids.slice(0, 300));
  }, [engine, snapshot]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);
  // Today and My deals only hold the viewer's deals, so an owner filter is dropped there.
  const setTab = useCallback(
    (tab: TabId) =>
      setQuery((q) => ({
        ...q,
        tab,
        ...defaultSort(tab),
        owner: tab === 'today' || tab === 'mine' ? null : q.owner,
        // Won and Lost are not on the Today or Quarter-end path, so a leftover filter for them would show an empty list.
        stage: (tab === 'today' || tab === 'cleanup') && (q.stage === 'Won' || q.stage === 'Lost') ? null : q.stage,
      })),
    [],
  );
  const setOwner = useCallback((owner: string | null) => setQuery((q) => ({ ...q, owner })), []);
  const setCloseRange = useCallback((closeFrom: number | null, closeTo: number | null) => setQuery((q) => ({ ...q, closeFrom, closeTo })), []);
  const clearFilters = useCallback(() => setQuery((q) => ({ ...q, stage: null, search: '', owner: null, closeFrom: null, closeTo: null })), []);
  const setStage = useCallback((stage: Stage | null) => setQuery((q) => ({ ...q, stage })), []);
  const setSearch = useCallback((value: string) => setQuery((q) => ({ ...q, search: value })), []);
  const toggleSort = useCallback(
    (key: SortKey) =>
      setQuery((q) => ({
        ...q,
        sortKey: key,
        sortDir: q.sortKey === key ? (q.sortDir === 'asc' ? 'desc' : 'asc') : key === 'company' || key === 'owner' ? 'asc' : 'desc',
      })),
    [],
  );
  const openReview = useCallback(
    (ids: string[], label: string) =>
      setQuery((q) => ({ ...q, tab: 'review', stage: null, reviewIds: ids, reviewLabel: label, ...defaultSort('review') })),
    [],
  );
  const closeReview = useCallback(() => setQuery((q) => ({ ...q, tab: 'today', reviewIds: [], reviewLabel: '', ...defaultSort('today') })), []);
  const matchingIds = useCallback(() => collectMatchingIds(engine, effective, ctx), [engine, effective, ctx]);

  return {
    query,
    effective,
    ctx,
    snapshot,
    stats,
    pendingChanges,
    refresh,
    setTab,
    setStage,
    setSearch,
    setOwner,
    setCloseRange,
    clearFilters,
    toggleSort,
    openReview,
    closeReview,
    matchingIds,
  };
}

export type PipelineView = ReturnType<typeof usePipelineView>;
