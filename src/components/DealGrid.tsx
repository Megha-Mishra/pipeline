import { memo, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type Ref } from 'react';
import { dayDiff } from '../domain/dates';
import { formatCount, formatDate, formatINR, plural } from '../domain/format';
import type { Priority } from '../domain/priority';
import { firstName } from '../domain/types';
import type { DisplayRow, PipelineEngine } from '../sync/engine';
import { matchesQuery, type SortKey, type ViewContext, type ViewQuery } from '../view/query';
import { isSelected, type Selection } from '../view/selection';
import { avatarTone, initials } from './avatar';
import type { BulkOutcome } from './bulkOutcome';
import { pickColumns, type Column } from './columns';
import { AlertIcon, CheckIcon, ClockIcon, ConflictIcon, PersonIcon, SpinnerIcon } from './Icons';
import { leftViewMessage, updatedLine } from './leftView';
import { PAGE_SIZES, clampPage, pageCount, rowsLabel } from './pagination';
import { StageBadge } from './StageBadge';

export const ROW_HEIGHT = 36;
const TEAMMATE_NOTE_MS = 10_000;
const SAVED_NOTE_MS = 4_000;

export interface RowActions {
  onRowMouseDown: (id: string, e: MouseEvent) => void;
  onToggle: (id: string, shift: boolean) => void;
  onStageClick: (id: string) => void;
  onRetry: (id: string) => void;
  onResolve: (id: string) => void;
}

interface DealGridProps {
  engine: PipelineEngine;
  version: number;
  /** IDs on the current page, sliced from the frozen order of the whole view. */
  pageIds: string[];
  /** Index of the page's first row within the whole view. */
  offset: number;
  total: number;
  page: number;
  pageSize: number;
  priorities: Map<string, Priority>;
  query: ViewQuery;
  ctx: ViewContext;
  selection: Selection;
  focusedId: string | null;
  actions: RowActions;
  bulkOutcomes: Map<string, BulkOutcome>;
  /** Header checkbox: is every row on this page selected, some of them, or none. */
  pageChecked: 'all' | 'some' | 'none';
  /** "All 50 on this page selected. Select all 14,848 matching deals", or null. */
  selectionNote: ReactNode;
  onSort: (key: SortKey) => void;
  onTogglePage: () => void;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
  gridRef: Ref<HTMLDivElement>;
  empty: ReactNode;
}

/**
 * The deals table, one page at a time. A page is at most 100 rows, so it renders without
 * virtualisation; rows are memoised so a teammate's edit re-renders only that row.
 */
export function DealGrid(props: DealGridProps) {
  const { engine, pageIds, offset, total, page, pageSize, priorities, query, ctx, selection, focusedId, actions, onSort, gridRef, empty } = props;
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const clock = useClock(2000);
  const now = Math.max(clock, ctx.now);

  const width = useWidth(scrollRef);
  const layout = pickColumns(query.tab, width);
  const { columns, template } = layout;

  // A new page starts at the top; then the focused row is kept in view as the user moves.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [page, pageSize, query]);
  useEffect(() => {
    if (focusedId) document.getElementById(`row-${focusedId}`)?.scrollIntoView({ block: 'nearest' });
  }, [focusedId, pageIds]);

  const setRefs = (el: HTMLDivElement | null) => {
    scrollRef.current = el;
    if (typeof gridRef === 'function') gridRef(el);
    else if (gridRef) (gridRef as { current: HTMLDivElement | null }).current = el;
  };

  return (
    <div className="table-card">
      {props.selectionNote && (
        <div className="page-note" role="status">
          {props.selectionNote}
        </div>
      )}
      <div
        ref={setRefs}
        className="grid-scroll"
        role="grid"
        tabIndex={0}
        aria-label={`Deals, page ${page} of ${pageCount(total, pageSize)}`}
        aria-rowcount={total + 1}
        aria-multiselectable="true"
        aria-activedescendant={focusedId ? `row-${focusedId}` : undefined}
      >
        <div className="grid-header" role="row" aria-rowindex={1} style={{ gridTemplateColumns: template, minWidth: layout.minWidth }}>
          {columns.map((col) => {
            const sorted = col.sort && query.sortKey === col.sort;
            const ariaSort = sorted ? (query.sortDir === 'asc' ? 'ascending' : 'descending') : undefined;
            if (col.key === 'select') {
              return (
                <div key={col.key} role="columnheader" className="cell cell--select">
                  <PageCheckbox state={props.pageChecked} onChange={props.onTogglePage} />
                </div>
              );
            }
            return (
              <div key={col.key} role="columnheader" aria-sort={ariaSort} className={`cell ${col.align === 'right' ? 'cell--right' : ''}`}>
                {col.sort ? (
                  <button type="button" className={`sort ${sorted ? 'sort--active' : ''}`} onClick={() => onSort(col.sort!)} title={`Sort by ${col.label.toLowerCase()}`}>
                    {col.label}
                    <span aria-hidden="true" className="sort-arrow">
                      {sorted ? (query.sortDir === 'asc' ? '↑' : '↓') : ''}
                    </span>
                  </button>
                ) : (
                  col.label
                )}
              </div>
            );
          })}
        </div>

        {pageIds.length === 0 ? (
          <div className="grid-empty">{empty}</div>
        ) : (
          <div role="rowgroup" style={{ minWidth: layout.minWidth }}>
            {pageIds.map((id, i) => {
              const row = engine.getRow(id);
              if (!row) return null;
              const inView = matchesQuery(row.deal, query, ctx);
              const teammateAt = engine.teammateFlashAt(id);
              return (
                <Row
                  key={`${id}:${teammateAt ?? 0}`}
                  id={id}
                  rowIndex={offset + i + 2}
                  alt={i % 2 === 1}
                  row={row}
                  priority={priorities.get(id)}
                  bulk={props.bulkOutcomes.get(id)}
                  selected={isSelected(selection, id) && (selection.mode === 'ids' || inView)}
                  focused={id === focusedId}
                  inView={inView}
                  leftNote={inView ? undefined : leftViewMessage(row.deal, ctx.me, query.tab)}
                  leftByMe={row.deal.updatedBy === ctx.me}
                  idle={updatedLine(row.deal, ctx.me, now)}
                  teammateAt={teammateAt}
                  savedAt={engine.savedFlashAt(id)}
                  columns={columns}
                  template={template}
                  minWidth={layout.minWidth}
                  clock={clock}
                  now={ctx.now}
                  actions={actions}
                />
              );
            })}
          </div>
        )}
      </div>
      <Pager page={page} pageSize={pageSize} total={total} onPage={props.onPage} onPageSize={props.onPageSize} />
    </div>
  );
}

/** Header checkbox for the current page, showing a mixed state when only some of it is selected. */
function PageCheckbox({ state, onChange }: { state: 'all' | 'some' | 'none'; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      tabIndex={-1}
      aria-label={state === 'all' ? 'Clear selection on this page' : 'Select all deals on this page'}
      checked={state === 'all'}
      onChange={onChange}
    />
  );
}

/** "Rows 51–100 of 14,848", rows per page, and "Page [3] of 297" with Previous and Next. */
function Pager({ page, pageSize, total, onPage, onPageSize }: { page: number; pageSize: number; total: number; onPage: (page: number) => void; onPageSize: (size: number) => void }) {
  const pages = pageCount(total, pageSize);
  const [draft, setDraft] = useState(String(page));
  useEffect(() => setDraft(String(page)), [page]);

  const jump = () => {
    const next = clampPage(Number(draft), total, pageSize);
    setDraft(String(next));
    if (next !== page) onPage(next);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      jump();
    }
  };

  return (
    <nav className="pager" aria-label="Pages">
      <span className="pager-rows">{rowsLabel(page, pageSize, total)}</span>
      <label className="pager-size">
        Rows per page
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
      <span className="pager-spacer" />
      <label className="pager-page">
        Page
        <input
          type="text"
          inputMode="numeric"
          aria-label={`Page number, 1 to ${pages}. Press Enter to go`}
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
          onKeyDown={onKeyDown}
          onBlur={() => setDraft(String(page))}
        />
        of {formatCount(pages)}
      </label>
      <button type="button" className="btn btn--outline btn--small" disabled={page <= 1} onClick={() => onPage(page - 1)} title="Previous page (Page Up)">
        Previous
      </button>
      <button type="button" className="btn btn--outline btn--small" disabled={page >= pages} onClick={() => onPage(page + 1)} title="Next page (Page Down)">
        Next
      </button>
    </nav>
  );
}

interface RowProps {
  id: string;
  /** 1-based position in the whole view plus the header row, for aria-rowindex. */
  rowIndex: number;
  /** Every other row gets a faint stripe. */
  alt: boolean;
  row: DisplayRow;
  priority: Priority | undefined;
  bulk: BulkOutcome | undefined;
  selected: boolean;
  focused: boolean;
  inView: boolean;
  /** Why the row no longer matches the view; set only when it doesn't. */
  leftNote: string | undefined;
  /** The viewer made the last change, so the note gets a tick rather than a person icon. */
  leftByMe: boolean;
  /** "Updated 2 days ago by you", shown when nothing else is going on. */
  idle: string;
  teammateAt: number | undefined;
  savedAt: number | undefined;
  columns: readonly Column[];
  template: string;
  minWidth: number;
  clock: number;
  now: number;
  actions: RowActions;
}

/** Memoised: a row re-renders only when its own deal, status or flags change. */
const Row = memo(function Row(p: RowProps) {
  const { status } = p.row;
  const flashing = p.teammateAt !== undefined && Date.now() - p.teammateAt < 3000;
  const classes = [
    'row',
    p.alt && 'row--alt',
    p.selected && 'row--selected',
    p.focused && 'row--focused',
    !p.inView && 'row--left',
    status?.kind === 'failed' && 'row--failed',
    status?.kind === 'conflict' && 'row--conflict',
    flashing && 'row--flash',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      id={`row-${p.id}`}
      role="row"
      aria-rowindex={p.rowIndex}
      aria-selected={p.selected}
      className={classes}
      style={{ gridTemplateColumns: p.template, minWidth: p.minWidth, height: ROW_HEIGHT }}
      onMouseDown={(e) => p.actions.onRowMouseDown(p.id, e)}
    >
      {p.columns.map((col) => (
        <Cell key={col.key} col={col} p={p} />
      ))}
    </div>
  );
});

function Cell({ col, p }: { col: Column; p: RowProps }) {
  const { deal } = p.row;
  switch (col.key) {
    case 'select':
      return (
        <div role="gridcell" className="cell cell--select">
          <input
            type="checkbox"
            tabIndex={-1}
            aria-label={`Select ${deal.company}`}
            checked={p.selected}
            onChange={() => undefined}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => p.actions.onToggle(p.id, e.shiftKey)}
          />
        </div>
      );
    case 'deal': {
      const meta = `${deal.city}, ${plural(deal.licences, 'licence')}`;
      return (
        <div role="gridcell" className="cell cell--deal" title={`${deal.company}. ${meta}`}>
          <span className="deal-name">{deal.company}</span>
          <span className="deal-meta">{meta}</span>
        </div>
      );
    }
    case 'reason':
      return (
        <div role="gridcell" className="cell cell--center">
          {p.priority && (
            <span className={`pill pill--${p.priority.reason === 'Close date today' ? 'today' : REASON_TONE[p.priority.tone]}`} title={p.priority.reason}>
              <span className="pill-text">{p.priority.reason}</span>
            </span>
          )}
        </div>
      );
    case 'owner':
      return (
        <div role="gridcell" className="cell cell--owner" title={deal.owner}>
          <span className={`avatar avatar--${avatarTone(deal.owner)}`} aria-hidden="true">
            {initials(deal.owner)}
          </span>
          <span className="owner-name">{deal.owner}</span>
        </div>
      );
    case 'stage':
      return (
        <div role="gridcell" className="cell cell--center">
          <button
            type="button"
            tabIndex={-1}
            className="stage-button"
            aria-label={`Stage ${deal.stage}. Change stage`}
            title="Change stage (M)"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => p.actions.onStageClick(p.id)}
          >
            <StageBadge stage={deal.stage} chevron />
          </button>
        </div>
      );
    case 'value':
      return (
        <div role="gridcell" className="cell cell--right cell--num">
          {formatINR(deal.value)}
        </div>
      );
    case 'close':
      // Plain ink: urgency is shown by the Why today pill and, in cleanup, the Overdue column.
      return (
        <div role="gridcell" className="cell">
          {formatDate(deal.closeDate)}
        </div>
      );
    case 'overdue': {
      const days = -dayDiff(deal.closeDate, p.now);
      return (
        <div role="gridcell" className={`cell ${days > 0 ? 'cell--overdue' : 'cell--secondary'}`}>
          {days > 0 ? plural(days, 'day') : 'Not overdue'}
        </div>
      );
    }
    case 'status':
      return (
        <div role="gridcell" className="cell cell--center">
          <StatusCell {...p} />
        </div>
      );
  }
}

const REASON_TONE: Record<Priority['tone'], string> = { urgent: 'failed', soon: 'saving', stale: 'neutral', fresh: 'info' };

/** One status per row, most important first: save problems, then live changes, then bulk results, then the quiet "Updated…" line. */
function StatusCell(p: RowProps) {
  const { deal, status } = p.row;
  const stop = (e: MouseEvent) => e.stopPropagation();
  if (status?.kind === 'queued') return <Pill tone="neutral" icon={<ClockIcon />} text="Waiting" title={`Waiting in bulk move to ${status.target}`} />;
  if (status?.kind === 'saving') return <Pill tone="saving" icon={<SpinnerIcon />} text="Saving…" title={`Saving move to ${status.target}`} />;
  if (status?.kind === 'failed') {
    const text = status.error === 'offline' ? "Offline, didn't save" : "Didn't save";
    return (
      <Pill tone="failed" icon={<AlertIcon />} text={text} title={`Move to ${status.target} didn't save`}>
        <button type="button" tabIndex={-1} className="btn btn--xs btn--danger-outline" title="Retry (R)" onMouseDown={stop} onClick={() => p.actions.onRetry(p.id)}>
          Retry
        </button>
      </Pill>
    );
  }
  if (status?.kind === 'conflict') {
    return (
      <Pill tone="conflict" icon={<ConflictIcon />} text={`${firstName(status.by)} moved it to ${status.theirs}`}>
        <button type="button" tabIndex={-1} className="btn btn--xs btn--conflict-outline" title="Resolve (Enter)" onMouseDown={stop} onClick={() => p.actions.onResolve(p.id)}>
          Resolve
        </button>
      </Pill>
    );
  }
  // A row that left the view gets one message saying who changed it and that it goes on refresh.
  if (p.leftNote) return <Pill tone="left" icon={p.leftByMe ? <CheckIcon /> : <PersonIcon />} text={p.leftNote} />;
  if (p.teammateAt !== undefined && p.clock - p.teammateAt < TEAMMATE_NOTE_MS) {
    return <Pill tone="info" icon={<PersonIcon />} text={`${firstName(deal.updatedBy)} changed this just now`} />;
  }
  if (p.bulk?.kind === 'moved') return <Pill tone="success" icon={<CheckIcon />} text={`${p.bulk.isUndo ? 'Reverted' : 'Moved'} to ${p.bulk.to}`} />;
  if (p.bulk?.kind === 'skipped') return <Pill tone="conflict" icon={<ConflictIcon />} text={`Skipped: ${firstName(p.bulk.by)} moved it to ${p.bulk.theirs}`} />;
  if (p.bulk?.kind === 'failed') return <Pill tone="failed" icon={<AlertIcon />} text="Didn't save" />;
  if (p.savedAt !== undefined && p.clock - p.savedAt < SAVED_NOTE_MS) return <Pill tone="success" icon={<CheckIcon />} text="Saved" />;
  return (
    <span className="status-idle" title={p.idle}>
      {p.idle}
    </span>
  );
}

/** Status pill: icon plus text that truncates with a tooltip, and an optional action that never gets cut off. */
function Pill({ tone, icon, text, title, children }: { tone: string; icon?: ReactNode; text: string; title?: string; children?: ReactNode }) {
  return (
    <span className="status">
      <span className={`pill pill--${tone}`} title={title ?? text}>
        {icon}
        <span className="pill-text">{text}</span>
      </span>
      {children}
    </span>
  );
}

/** Tracks an element's inner width (without its scrollbar), so columns can adapt to the space available. */
function useWidth(ref: { current: HTMLElement | null }): number {
  const [width, setWidth] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [ref]);
  return width;
}

/** A coarse clock so time-based notes ("just now") expire without re-rendering every frame. */
function useClock(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}
