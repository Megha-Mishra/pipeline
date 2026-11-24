import { describe, expect, it } from 'vitest';
import { EMPTY_SELECTION, isSelected, resolveSelection, selectAllMatching, selectionCount, setRange, toggle } from './selection';

describe('selection', () => {
  it('toggles individual deals', () => {
    const sel = toggle(toggle(EMPTY_SELECTION, 'a'), 'b');
    expect(isSelected(sel, 'a')).toBe(true);
    expect(selectionCount(toggle(sel, 'a'), 0)).toBe(1);
  });

  it('selects all matching without listing every ID, and supports exclusions', () => {
    const sel = toggle(selectAllMatching(), 'b');
    expect(selectionCount(sel, 8412)).toBe(8411);
    expect(isSelected(sel, 'zzz')).toBe(true);
    expect(isSelected(sel, 'b')).toBe(false);
  });

  it('re-evaluates the filter when the action runs', () => {
    const sel = toggle(selectAllMatching(), 'b');
    // 'c' left the filter because a teammate moved it: it is not included.
    expect(resolveSelection(sel, () => ['a', 'b', 'd'])).toEqual(['a', 'd']);
  });

  it('selects a range', () => {
    const sel = setRange(EMPTY_SELECTION, ['a', 'b', 'c'], true);
    expect(resolveSelection(sel, () => [])).toEqual(['a', 'b', 'c']);
  });
});
