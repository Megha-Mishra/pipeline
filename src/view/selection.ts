/**
 * Selection is either an explicit set of IDs, or "everything matching the
 * current filter" minus exclusions. The second form never materialises 8,000
 * IDs up front, and it re-checks the filter when the action runs, so deals
 * a teammate moved out of the filter are not touched by accident.
 */
export type Selection =
  | { mode: 'ids'; ids: ReadonlySet<string> }
  | { mode: 'all'; excluded: ReadonlySet<string> };

export const EMPTY_SELECTION: Selection = { mode: 'ids', ids: new Set() };

export function isEmpty(sel: Selection): boolean {
  return sel.mode === 'ids' && sel.ids.size === 0;
}

export function isSelected(sel: Selection, id: string): boolean {
  return sel.mode === 'ids' ? sel.ids.has(id) : !sel.excluded.has(id);
}

export function toggle(sel: Selection, id: string): Selection {
  if (sel.mode === 'ids') {
    const ids = new Set(sel.ids);
    if (ids.has(id)) ids.delete(id);
    else ids.add(id);
    return { mode: 'ids', ids };
  }
  const excluded = new Set(sel.excluded);
  if (excluded.has(id)) excluded.delete(id);
  else excluded.add(id);
  return { mode: 'all', excluded };
}

/** Selects (or deselects) a contiguous range, e.g. Shift+click or Shift+Arrow. */
export function setRange(sel: Selection, ids: readonly string[], selected: boolean): Selection {
  if (sel.mode === 'ids') {
    const next = new Set(sel.ids);
    ids.forEach((id) => (selected ? next.add(id) : next.delete(id)));
    return { mode: 'ids', ids: next };
  }
  const excluded = new Set(sel.excluded);
  ids.forEach((id) => (selected ? excluded.delete(id) : excluded.add(id)));
  return { mode: 'all', excluded };
}

export function selectAllMatching(): Selection {
  return { mode: 'all', excluded: new Set() };
}

export function selectionCount(sel: Selection, matching: number): number {
  return sel.mode === 'ids' ? sel.ids.size : Math.max(0, matching - sel.excluded.size);
}

/** Turns a selection into concrete IDs at the moment an action runs. */
export function resolveSelection(sel: Selection, matchingIds: () => string[]): string[] {
  if (sel.mode === 'ids') return [...sel.ids];
  return matchingIds().filter((id) => !sel.excluded.has(id));
}
