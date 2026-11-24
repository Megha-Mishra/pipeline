import { useEffect, useId, useRef, useState, type KeyboardEvent, type Ref } from 'react';
import { formatCount } from '../domain/format';
import { TEAM } from '../domain/seed';
import type { TabId } from '../view/query';
import { avatarTone, initials } from './avatar';
import { ChevronIcon, SearchIcon } from './Icons';
import { ViewSwitch } from './ViewSwitch';

interface HeaderProps {
  tab: TabId;
  tabCounts: Record<TabId, number>;
  reviewLabel: string;
  onTab: (tab: TabId) => void;
  onCloseReview: () => void;
  me: string;
  onMeChange: (name: string) => void;
  search: string;
  onSearch: (value: string) => void;
  searchRef: Ref<HTMLInputElement>;
  offline: boolean;
  failedCount: number;
  onRetryAll: () => void;
  /** What Undo would reverse, e.g. "Move Acme Corp to Won". Null when there is nothing to undo. */
  undoLabel: string | null;
  onUndo: () => void;
}

/** Navbar account menu: every person keeps the same initials icon as the closed "Viewing as" control. */
function AccountSwitch({ me, onChange }: { me: string; onChange: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();
  const needle = query.trim().toLowerCase();
  const visible = TEAM.filter((name) => name.toLowerCase().includes(needle));

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

  const choose = (name: string) => {
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
    <div className="account" title="Switch user (simulated login)" ref={rootRef}>
      <span className="account-label">Viewing as</span>
      <span className="account-control">
        <button
          ref={buttonRef}
          type="button"
          className="account-button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={`Viewing as ${me}`}
          onClick={() => setOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              setOpen(true);
            }
          }}
        >
          <span className={`avatar avatar--${avatarTone(me)}`} aria-hidden="true">
            {initials(me)}
          </span>
          <span className="account-name">{me}</span>
          <ChevronIcon />
        </button>
        {open && (
          <div id={listId} className="account-menu" role="listbox" aria-label="Viewing as" onKeyDown={onListKeyDown}>
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
                key={name}
                ref={(el) => (optionRefs.current[i] = el)}
                type="button"
                role="option"
                aria-selected={name === me}
                className="account-option"
                onClick={() => choose(name)}
              >
                <span className={`avatar avatar--${avatarTone(name)}`} aria-hidden="true">
                  {initials(name)}
                </span>
                <span className="account-option-name">{name}</span>
              </button>
            ))}
          </div>
        )}
      </span>
    </div>
  );
}

export function Header(p: HeaderProps) {
  return (
    <header className="header">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">
          P
        </span>
        <h1 className="title">Pipeline</h1>
      </div>
      <ViewSwitch active={p.tab} counts={p.tabCounts} reviewLabel={p.reviewLabel} onSelect={p.onTab} onCloseReview={p.onCloseReview} />

      <div className="header-actions">
        <div className="search">
          <SearchIcon />
          <label htmlFor="search" className="sr-only">
            Search deals
          </label>
          <input
            id="search"
            ref={p.searchRef}
            type="search"
            value={p.search}
            placeholder="Search deals"
            title="Search company, city, owner or ID (/)"
            onChange={(e) => p.onSearch(e.target.value)}
            autoComplete="off"
          />
          <kbd>/</kbd>
        </div>
        <span className={`live ${p.offline ? 'live--off' : ''}`} role="status">
          <span className="live-dot" aria-hidden="true" />
          {p.offline ? 'Offline' : 'Live'}
        </span>
        {/* An account switcher rather than a filter: it changes who "you" are, standing in for login. */}
        <AccountSwitch me={p.me} onChange={p.onMeChange} />
        <button
          type="button"
          className="btn btn--ghost header-undo"
          onClick={p.onUndo}
          disabled={!p.undoLabel}
          title={p.undoLabel ? `Undo: ${p.undoLabel} (Ctrl/⌘+Z)` : 'Nothing to undo'}
          aria-label={p.undoLabel ? `Undo: ${p.undoLabel}` : 'Undo'}
        >
          Undo
        </button>
        {p.failedCount > 0 && (
          <button type="button" className="btn btn--danger-outline" onClick={p.onRetryAll} title="Retry all (Shift+R)">
            {formatCount(p.failedCount)} not saved. Retry all
          </button>
        )}
      </div>
    </header>
  );
}
