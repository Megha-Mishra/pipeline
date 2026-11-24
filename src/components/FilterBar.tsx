import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatCount } from '../domain/format';
import { TEAM } from '../domain/seed';
import { STAGES, type Stage } from '../domain/types';
import type { SortDir, SortKey, TabId } from '../view/query';
import { avatarTone, initials } from './avatar';
import { fromDateInput, toDateInput } from './dateInput';
import { filterChips, type ChipRemove } from './filterChips';
import { ChevronIcon, CloseIcon, PersonIcon, SearchIcon } from './Icons';
import { describeSort } from './listPosition';

interface FilterBarProps {
  tab: TabId;
  /** The "Viewing as" person, named in the Today and My deals chips. */
  me: string;
  reviewLabel: string;
  stage: Stage | null;
  owner: string | null;
  closeFrom: number | null;
  closeTo: number | null;
  search: string;
  total: number;
  sortKey: SortKey;
  sortDir: SortDir;
  pendingChanges: number;
  onClearView: () => void;
  onStage: (stage: Stage | null) => void;
  onOwner: (owner: string | null) => void;
  onCloseRange: (from: number | null, to: number | null) => void;
  onClearSearch: () => void;
  onClearFilters: () => void;
  onRefresh: () => void;
}

/**
 * Filters above the table: close-date range, stage (the same state the stage path sets), owner
 * (only where deals can belong to anyone), the view and search as chips, and a sentence on what
 * is shown and in what order. All of them feed the view query, so counts and "select all
 * matching" always agree with what the table shows.
 */
export function FilterBar(p: FilterBarProps) {
  const chips = filterChips(p.tab, p.me, p.reviewLabel, p.search);
  const onRemove: Record<ChipRemove, () => void> = { view: p.onClearView, search: p.onClearSearch };
  const ownerApplies = p.tab !== 'today' && p.tab !== 'mine';
  const anyFilter = p.stage !== null || p.owner !== null || p.closeFrom !== null || p.closeTo !== null;

  return (
    <div className="filterbar">
      <div className="filterbar-controls">
      <span className="filterbar-label" id="filters-label">
        Filters
      </span>

      <div className="filter-dates" role="group" aria-label="Close date">
        <label className="filter-date">
          <span className="sr-only">Close date from</span>
          <input
            type="date"
            value={toDateInput(p.closeFrom)}
            max={toDateInput(p.closeTo) || undefined}
            onChange={(e) => p.onCloseRange(fromDateInput(e.target.value), p.closeTo)}
            title="Close date from"
          />
        </label>
        <label className="filter-date">
          <span className="sr-only">Close date to</span>
          <input
            type="date"
            value={toDateInput(p.closeTo)}
            min={toDateInput(p.closeFrom) || undefined}
            onChange={(e) => p.onCloseRange(p.closeFrom, fromDateInput(e.target.value, true))}
            title="Close date to"
          />
        </label>
      </div>

      <FilterSelect label="Stage" value={p.stage ?? ''} onChange={(v) => p.onStage((v || null) as Stage | null)}>
        <option value="">All stages</option>
        {STAGES.map((stage) => (
          <option key={stage} value={stage}>
            {stage}
          </option>
        ))}
      </FilterSelect>

      {ownerApplies && <OwnerFilter value={p.owner} onChange={p.onOwner} />}

      {chips.length > 0 && (
        <ul className="chips" aria-label="View and search">
          {chips.map((c) => (
            <Chip key={`${c.name}:${c.value}`} name={c.name} value={c.value} leavesView={c.remove === 'view'} onRemove={onRemove[c.remove]} />
          ))}
        </ul>
      )}
      {anyFilter && (
        <button type="button" className="link filterbar-clear" onClick={p.onClearFilters}>
          Clear filters
        </button>
      )}
      </div>

      <div className="filterbar-end">
        <p className="filterbar-summary">
          {formatCount(p.total)} {p.total === 1 ? 'deal' : 'deals'}. {describeSort(p.sortKey, p.sortDir)}
        </p>
        {p.pendingChanges > 0 && (
          <button type="button" className="refresh-pill" onClick={p.onRefresh} title="Re-sort the table with teammates' latest changes">
            {formatCount(p.pendingChanges)} {p.pendingChanges === 1 ? 'update' : 'updates'}. Refresh order
          </button>
        )}
      </div>
    </div>
  );
}

/** A native select styled as a bordered box with a search icon and a chevron, like the other filters. */
function FilterSelect({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <label className={`filter-select${value ? ' filter-select--active' : ''}`}>
      <SearchIcon />
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
      <ChevronIcon />
    </label>
  );
}

/** Initials circle, the same mark used for "Viewing as" and the Owner column. "All owners" gets a person mark. */
function OwnerAvatar({ name }: { name: string | null }) {
  if (!name) {
    return (
      <span className="avatar avatar--7" aria-hidden="true">
        <PersonIcon />
      </span>
    );
  }
  return (
    <span className={`avatar avatar--${avatarTone(name)}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

const OWNER_OPTIONS: Array<string | null> = [null, ...TEAM];

/** Owner filter whose closed value and every choice show a name icon, like "Viewing as". */
function OwnerFilter({ value, onChange }: { value: string | null; onChange: (owner: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();
  const needle = query.trim().toLowerCase();
  const visible = OWNER_OPTIONS.filter((name) => (name ?? 'All owners').toLowerCase().includes(needle));

  useEffect(() => {
    if (!open) return;
    setQuery('');
    searchRef.current?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const choose = (name: string | null) => {
    onChange(name);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onListKeyDown = (e: KeyboardEvent) => {
    const buttons = optionRefs.current.filter((el): el is HTMLButtonElement => el !== null);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : index + (e.key === 'ArrowDown' ? 1 : -1);
      buttons[Math.min(buttons.length - 1, Math.max(0, next))]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.stopPropagation();
    }
  };

  const onSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      optionRefs.current[0]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className={`owner-filter${value ? ' owner-filter--active' : ''}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="owner-filter-button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={`Owner, ${value ?? 'All owners'}`}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            setOpen(true);
          }
        }}
      >
        <OwnerAvatar name={value} />
        <span className="owner-filter-label">{value ?? 'All owners'}</span>
        <ChevronIcon />
      </button>
      {open && (
        <div id={listId} className="owner-menu" role="listbox" aria-label="Owner" onKeyDown={onListKeyDown}>
          <label className="menu-search">
            <SearchIcon />
            <input
              ref={searchRef}
              type="search"
              value={query}
              placeholder="Search owners"
              aria-label="Search owners"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onSearchKeyDown}
            />
          </label>
          {visible.length === 0 && <p className="menu-empty">No owners</p>}
          {visible.map((name, i) => (
            <button
              key={name ?? 'all'}
              ref={(el) => (optionRefs.current[i] = el)}
              type="button"
              role="option"
              aria-selected={name === value}
              className="owner-option"
              onClick={() => choose(name)}
            >
              <OwnerAvatar name={name} />
              <span className="owner-option-name">{name ?? 'All owners'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ name, value, leavesView, onRemove }: { name: string; value: string | null; leavesView: boolean; onRemove: () => void }) {
  const text = value ? `${name}: ${value}` : name;
  const label = leavesView ? `Leave ${name} and show all deals` : `Remove filter ${text}`;
  return (
    <li className="chip">
      <span>
        {value ? (
          <>
            {name}: <span className="chip-value">{value}</span>
          </>
        ) : (
          <span className="chip-name">{name}</span>
        )}
      </span>
      <button type="button" className="chip-remove" aria-label={label} title={leavesView ? 'Show all deals' : 'Remove filter'} onClick={onRemove}>
        <CloseIcon />
      </button>
    </li>
  );
}
