import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react';
import { BottomBar } from './components/BottomBar';
import { bulkOutcomeKey, bulkOutcomes } from './components/bulkOutcome';
import { DealGrid, type RowActions } from './components/DealGrid';
import { ConfirmMove, ConflictDialog, ShortcutsDialog, StagePicker } from './components/Dialogs';
import { emptyStateFor, type EmptyAction } from './components/emptyState';
import { Footer } from './components/Footer';
import { FilterBar } from './components/FilterBar';
import { DEFAULT_PAGE_SIZE, clampPage, navigate, pageBounds, pageOfIndex, type PageKey } from './components/pagination';
import { Header } from './components/Header';
import { SimulationPanel } from './components/SimulationPanel';
import { StagePath } from './components/StagePath';
import { Toasts } from './components/Toasts';
import { formatCount } from './domain/format';
import { STAGES, type Stage } from './domain/types';
import { usePipelineView } from './hooks/usePipelineView';
import type { PipelineEngine, ToastAction } from './sync/engine';
import type { TabId } from './view/query';
import {
  EMPTY_SELECTION,
  isEmpty,
  isSelected,
  resolveSelection,
  selectAllMatching,
  selectionCount,
  setRange,
  toggle,
  type Selection,
} from './view/selection';

/** Moving at least this many deals asks for confirmation; smaller moves just happen (and can be undone). */
const CONFIRM_AT = 100;
/** Must match --footer-h in styles.css: the bottom bar and toasts float this far above the window's bottom edge. */
const FOOTER_HEIGHT = 30;
/** Space between floating layers (footer, bottom bar, toasts) and below the last row. */
const GAP = 12;
/** Smaller gap between the table and the keyboard footer. */
const TABLE_FOOTER_GAP = 4;

type Dialog =
  | { kind: 'picker'; ids: string[] }
  | { kind: 'confirm'; ids: string[]; stage: Stage }
  | { kind: 'conflict'; id: string }
  | { kind: 'shortcuts' }
  | null;

export function App({ engine }: { engine: PipelineEngine }) {
  const version = useSyncExternalStore(engine.subscribe, engine.getVersion);
  const view = usePipelineView(engine, version);
  const { snapshot, stats, effective } = view;
  const ids = snapshot.ids;

  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [simOpen, setSimOpen] = useState(false);
  const [barHeight, setBarHeight] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const gridRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // A selection belongs to a filter. Changing the filter starts a new one.
  useEffect(() => {
    setSelection(EMPTY_SELECTION);
    setAnchorId(null);
  }, [effective.tab, effective.stage, effective.search, effective.owner, effective.closeFrom, effective.closeTo, effective.reviewIds]);

  // A new view, filter, search or sort starts on page 1. A refresh keeps the page number if it still exists.
  useEffect(() => {
    setPage(1);
  }, [effective.tab, effective.stage, effective.search, effective.owner, effective.closeFrom, effective.closeTo, effective.sortKey, effective.sortDir, effective.reviewIds]);
  useEffect(() => {
    setPage((p) => clampPage(p, ids.length, pageSize));
  }, [ids.length, pageSize]);

  const { start: pageStart, end: pageEnd } = pageBounds(page, pageSize, ids.length);
  const pageIds = useMemo(() => ids.slice(pageStart, pageEnd), [ids, pageStart, pageEnd]);

  const indexById = useMemo(() => new Map(ids.map((id, i) => [id, i])), [ids]);
  // Focus always sits on the current page; if it isn't (new page, refresh), it moves to the page's first row.
  useEffect(() => {
    const index = focusedId === null ? -1 : indexById.get(focusedId) ?? -1;
    if (pageIds.length && (index < pageStart || index >= pageEnd)) setFocusedId(pageIds[0]);
  }, [pageIds, pageStart, pageEnd, indexById, focusedId]);

  const goToPage = useCallback(
    (next: number) => {
      const target = clampPage(next, ids.length, pageSize);
      setPage(target);
      const first = ids[(target - 1) * pageSize];
      if (first) {
        setFocusedId(first);
        setAnchorId(first);
      }
    },
    [ids, pageSize],
  );
  const changePageSize = useCallback(
    (size: number) => {
      // Stay on the page that holds the focused deal.
      const index = focusedId ? indexById.get(focusedId) ?? 0 : 0;
      setPageSize(size);
      setPage(pageOfIndex(index, size));
    },
    [focusedId, indexById],
  );

  const selCount = selectionCount(selection, stats.matching);
  const config = engine.getConfig();

  // Per-row results of the current bulk move, rebuilt only when a batch comes back.
  const outcomesKey = bulkOutcomeKey(engine.bulk);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const outcomes = useMemo(() => bulkOutcomes(engine.bulk), [outcomesKey]);

  // ---- Actions ----------------------------------------------------------

  const targetIds = useCallback((): string[] => {
    if (!isEmpty(selection)) return resolveSelection(selection, view.matchingIds);
    return focusedId ? [focusedId] : [];
  }, [selection, focusedId, view.matchingIds]);

  const performMove = useCallback(
    (moveIds: string[], stage: Stage) => {
      engine.move(moveIds, stage);
      if (moveIds.length > 1) setSelection(EMPTY_SELECTION);
    },
    [engine],
  );

  const requestMove = useCallback(
    (moveIds: string[], stage: Stage) => {
      if (moveIds.length === 0) return;
      if (moveIds.length >= CONFIRM_AT) setDialog({ kind: 'confirm', ids: moveIds, stage });
      else performMove(moveIds, stage);
    },
    [performMove],
  );

  const openPicker = useCallback(
    (forIds?: string[]) => {
      const pickIds = forIds ?? targetIds();
      if (pickIds.length) setDialog({ kind: 'picker', ids: pickIds });
    },
    [targetIds],
  );

  const focusGrid = () => gridRef.current?.focus({ preventScroll: true });

  const moveFocus = useCallback(
    (index: number, extend: boolean) => {
      if (ids.length === 0) return;
      const next = Math.max(0, Math.min(ids.length - 1, index));
      const nextId = ids[next];
      if (extend) {
        const anchor = anchorId ?? focusedId ?? nextId;
        const a = indexById.get(anchor) ?? next;
        setSelection((s) => setRange(s, ids.slice(Math.min(a, next), Math.max(a, next) + 1), true));
        setAnchorId(anchor);
      } else {
        setAnchorId(nextId);
      }
      setFocusedId(nextId);
      setPage(pageOfIndex(next, pageSize));
    },
    [ids, anchorId, focusedId, indexById, pageSize],
  );

  const rowActions: RowActions = useMemo(
    () => ({
      onRowMouseDown: (id: string, e: MouseEvent) => {
        if (e.shiftKey && focusedId) {
          e.preventDefault();
          const a = indexById.get(anchorId ?? focusedId) ?? 0;
          const b = indexById.get(id) ?? 0;
          setSelection((s) => setRange(s, ids.slice(Math.min(a, b), Math.max(a, b) + 1), true));
        } else {
          setAnchorId(id);
        }
        setFocusedId(id);
        requestAnimationFrame(focusGrid);
      },
      onToggle: (id: string, shift: boolean) => {
        if (shift && anchorId) {
          const a = indexById.get(anchorId) ?? 0;
          const b = indexById.get(id) ?? 0;
          setSelection((s) => setRange(s, ids.slice(Math.min(a, b), Math.max(a, b) + 1), true));
        } else {
          setSelection((s) => toggle(s, id));
          setAnchorId(id);
        }
        setFocusedId(id);
      },
      onStageClick: (id: string) => {
        setFocusedId(id);
        openPicker([id]);
      },
      onRetry: (id: string) => engine.retry(id),
      onResolve: (id: string) => setDialog({ kind: 'conflict', id }),
    }),
    [engine, ids, indexById, anchorId, focusedId, openPicker],
  );

  const onToastAction = useCallback(
    (action: ToastAction) => {
      if (action.kind === 'retry-failed') engine.retryAllFailed();
      else setDialog({ kind: 'conflict', id: action.id });
    },
    [engine],
  );
  const dismissToast = useCallback((id: string) => engine.dismissToast(id), [engine]);

  // ---- Keyboard ---------------------------------------------------------

  const keyState = useRef({ dialog, simOpen, gPending: false });
  keyState.current.dialog = dialog;
  keyState.current.simOpen = simOpen;

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      const state = keyState.current;
      if (state.dialog) return; // dialogs handle their own keys
      const target = e.target as HTMLElement;
      const typing = target.closest('input:not([type="checkbox"]), textarea, select, [contenteditable="true"]') !== null;
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

      if (mod && key === 'z' && !typing) {
        e.preventDefault();
        engine.undo();
        return;
      }
      if (typing) {
        if (e.key === 'Escape' || (e.key === 'ArrowDown' && target === searchRef.current)) {
          e.preventDefault();
          focusGrid();
        }
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === '?') {
        setDialog({ kind: 'shortcuts' });
        return;
      }
      if (state.gPending) {
        state.gPending = false;
        const tabs: Record<string, TabId> = { t: 'today', m: 'mine', a: 'all', c: 'cleanup' };
        if (tabs[key]) {
          view.setTab(tabs[key]);
          focusGrid();
        }
        return;
      }
      if (key === 'g' && !mod) {
        state.gPending = true;
        setTimeout(() => (state.gPending = false), 1200);
        return;
      }
      // Focus can fall back to the page (e.g. a button disabled itself); Esc should still close the panel.
      if (e.key === 'Escape' && state.simOpen && target === document.body) {
        setSimOpen(false);
        return;
      }
      if (key === 's' && e.shiftKey) {
        setSimOpen((o) => !o);
        return;
      }
      // Let buttons and links keep their native Enter/Space behaviour.
      if ((e.key === 'Enter' || e.key === ' ') && target.closest('button, a')) return;

      const index = focusedId ? indexById.get(focusedId) ?? 0 : 0;
      const navKeys: Record<string, PageKey> = { ArrowDown: 'down', j: 'down', ArrowUp: 'up', k: 'up', PageDown: 'pageDown', PageUp: 'pageUp', Home: 'home', End: 'end' };
      const navKey = mod ? undefined : navKeys[key];
      const stageNumber = Number(e.key);
      let handled = true;
      if (mod && key === 'a') {
        setSelection(selectAllMatching());
      } else if (mod) {
        handled = false;
      } else if (navKey) {
        // Arrows cross page edges, Page Up/Down change page, Home/End go to the ends of the whole list.
        moveFocus(navigate(navKey, index, pageSize, ids.length).index, e.shiftKey);
      } else if ((key === 'x' || e.key === ' ') && focusedId) {
        setSelection((s) => toggle(s, focusedId));
        setAnchorId(focusedId);
      } else if (e.key === 'Escape') {
        setSelection(EMPTY_SELECTION);
      } else if (stageNumber >= 1 && stageNumber <= STAGES.length) {
        requestMove(targetIds(), STAGES[stageNumber - 1]);
      } else if (key === 'm') {
        openPicker();
      } else if (key === 'r' && e.shiftKey) {
        engine.retryAllFailed();
      } else if (key === 'r' && focusedId) {
        engine.retry(focusedId);
      } else if (e.key === 'Enter' && focusedId && engine.getRow(focusedId)?.status?.kind === 'conflict') {
        setDialog({ kind: 'conflict', id: focusedId });
      } else {
        handled = false;
      }
      if (handled) {
        e.preventDefault();
        if (document.activeElement === document.body) focusGrid();
      }
    },
    [engine, view, focusedId, indexById, ids.length, pageSize, moveFocus, requestMove, targetIds, openPicker],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  // ---- Render -----------------------------------------------------------

  if (!engine.loaded) {
    // Static outline of the screen (no animation), so the layout doesn't jump when data arrives.
    return (
      <div className="app" aria-busy="true">
        <header className="header">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              P
            </span>
            <h1 className="title">Pipeline</h1>
          </div>
          <span className="loading-text" role="status">
            Loading 50,000 deals…
          </span>
        </header>
        <div className="stagepath" aria-hidden="true">
          {STAGES.map((stage) => (
            <div key={stage} className="placeholder placeholder--stage" />
          ))}
        </div>
        <div className="placeholder-rows" aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="placeholder placeholder--row" />
          ))}
        </div>
      </div>
    );
  }

  const job = engine.bulk;
  const focusedStage = dialog?.kind === 'picker' && dialog.ids.length === 1 ? engine.getRow(dialog.ids[0])?.deal.stage ?? null : null;
  const emptyState = emptyStateFor(effective);
  const emptyActions: Record<EmptyAction, () => void> = {
    'clear-search': () => view.setSearch(''),
    'clear-filters': view.clearFilters,
    'show-all-stages': () => view.setStage(null),
    'go-mine': () => view.setTab('mine'),
    'close-review': view.closeReview,
  };
  // The selection bar and error messages float over the table. The table keeps its height.
  const toastBottom = FOOTER_HEIGHT + GAP + (barHeight ? barHeight + GAP : 0);

  // Header checkbox and the line above the rows describe the current page's selection.
  const pageSelected = pageIds.filter((id) => isSelected(selection, id)).length;
  const pageChecked = pageIds.length && pageSelected === pageIds.length ? 'all' : pageSelected ? 'some' : 'none';
  const togglePage = () => setSelection((s) => setRange(s, pageIds, pageChecked !== 'all'));
  let selectionNote: ReactNode = null;
  if (selection.mode === 'all') {
    selectionNote = (
      <>
        All {formatCount(selCount)} matching deals selected.{' '}
        <button type="button" className="link" onClick={() => setSelection(EMPTY_SELECTION)}>
          Clear selection
        </button>
      </>
    );
  } else if (pageChecked === 'all' && stats.matching > pageIds.length) {
    selectionNote = (
      <>
        All {formatCount(pageIds.length)} on this page selected.{' '}
        <button type="button" className="link" onClick={() => setSelection(selectAllMatching())}>
          Select all {formatCount(stats.matching)} matching deals
        </button>
      </>
    );
  }

  const empty = (
    <>
      <p>{emptyState.message}</p>
      {emptyState.action && (
        <button type="button" className="btn btn--outline" onClick={emptyActions[emptyState.action.kind]}>
          {emptyState.action.label}
        </button>
      )}
    </>
  );

  return (
    <div className="app">
      <a href="#deals-grid" className="skip-link" onClick={(e) => (e.preventDefault(), focusGrid())}>
        Skip to deals
      </a>
      <Header
        tab={effective.tab}
        tabCounts={stats.tabCounts}
        reviewLabel={effective.reviewLabel}
        onTab={view.setTab}
        onCloseReview={view.closeReview}
        me={engine.me}
        onMeChange={(name) => engine.setMe(name)}
        search={view.query.search}
        onSearch={view.setSearch}
        searchRef={searchRef}
        offline={config.offline}
        failedCount={engine.failedIds.length}
        onRetryAll={() => engine.retryAllFailed()}
        undoLabel={engine.undoStack.at(-1)?.label ?? null}
        onUndo={() => engine.undo()}
      />
      {config.offline && (
        <div className="banner" role="status">
          You're offline. Moves won't save until you reconnect, and teammates' changes will arrive when you do.
        </div>
      )}
      <StagePath counts={stats.stageCounts} active={effective.stage} onSelect={view.setStage} />
      <FilterBar
        tab={effective.tab}
        me={engine.me}
        reviewLabel={effective.reviewLabel}
        stage={effective.stage}
        owner={effective.owner}
        closeFrom={effective.closeFrom}
        closeTo={effective.closeTo}
        search={view.query.search}
        total={ids.length}
        sortKey={effective.sortKey}
        sortDir={effective.sortDir}
        pendingChanges={view.pendingChanges}
        onClearView={effective.tab === 'review' ? view.closeReview : () => view.setTab('all')}
        onStage={view.setStage}
        onOwner={view.setOwner}
        onCloseRange={view.setCloseRange}
        onClearFilters={view.clearFilters}
        onClearSearch={() => view.setSearch('')}
        onRefresh={view.refresh}
      />

      {/* The table stays a short step above the keyboard footer. */}
      <main className="main" id="deals-grid" style={{ paddingBottom: TABLE_FOOTER_GAP }}>
        <DealGrid
          engine={engine}
          version={version}
          pageIds={pageIds}
          offset={pageStart}
          total={ids.length}
          page={clampPage(page, ids.length, pageSize)}
          pageSize={pageSize}
          onPage={goToPage}
          onPageSize={changePageSize}
          priorities={snapshot.priorities}
          query={effective}
          ctx={view.ctx}
          selection={selection}
          focusedId={focusedId}
          pageChecked={pageChecked}
          selectionNote={selectionNote}
          actions={rowActions}
          bulkOutcomes={outcomes}
          onSort={view.toggleSort}
          onTogglePage={togglePage}
          gridRef={gridRef}
          empty={empty}
        />
        {simOpen && (
          <SimulationPanel
            config={config}
            requests={engine.server.requestCount}
            hasFocusedDeal={focusedId !== null}
            onChange={(patch) => engine.setSimConfig(patch)}
            onTeammateEditFocused={() => focusedId && engine.server.teammateEdit(focusedId)}
            onTeammateBurst={() => Array.from({ length: 20 }).forEach(() => engine.server.teammateEdit())}
            onClose={() => setSimOpen(false)}
          />
        )}
      </main>

      <Toasts toasts={engine.toasts} bottom={toastBottom} onAction={onToastAction} onDismiss={dismissToast} />
      <BottomBar
        onHeight={setBarHeight}
        job={
          job && {
            job,
            cancelling: engine.bulkCancelling,
            canUndo: !job.isUndo && engine.undoStack.some((e) => e.jobId === job.id),
            onCancel: () => engine.cancelBulk(),
            onUndo: () => engine.undoBulk(job.id),
            onRetryFailed: () => engine.retryBulkFailed(),
            onReviewSkipped: () => view.openReview(job.conflicts.map((c) => c.id), `Skipped in bulk move (${formatCount(job.conflicts.length)})`),
            onDismiss: () => engine.dismissBulk(),
          }
        }
        selection={
          isEmpty(selection)
            ? null
            : {
                selection,
                count: selCount,
                matching: stats.matching,
                onSelectAll: () => setSelection(selectAllMatching()),
                onMove: () => openPicker(),
                onMoveToLost: effective.tab === 'cleanup' ? () => requestMove(targetIds(), 'Lost') : null,
                onClear: () => setSelection(EMPTY_SELECTION),
              }
        }
      />

      <Footer config={config} simOpen={simOpen} onToggleSim={() => setSimOpen((o) => !o)} onShowShortcuts={() => setDialog({ kind: 'shortcuts' })} />

      {dialog?.kind === 'picker' && (
        <StagePicker
          count={dialog.ids.length}
          current={focusedStage}
          onClose={() => setDialog(null)}
          onPick={(stage) => {
            setDialog(null);
            requestMove(dialog.ids, stage);
          }}
        />
      )}
      {dialog?.kind === 'confirm' && (
        <ConfirmMove
          count={dialog.ids.length}
          stage={dialog.stage}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            performMove(dialog.ids, dialog.stage);
          }}
        />
      )}
      {dialog?.kind === 'conflict' && <ConflictDialog engine={engine} id={dialog.id} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'shortcuts' && <ShortcutsDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
