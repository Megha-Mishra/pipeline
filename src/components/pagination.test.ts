import { describe, expect, it } from 'vitest';
import { clampPage, navigate, pageBounds, pageCount, pageOfIndex, rowsLabel } from './pagination';

describe('page slicing', () => {
  it('counts pages, with at least one', () => {
    expect(pageCount(14_848, 50)).toBe(297);
    expect(pageCount(100, 50)).toBe(2);
    expect(pageCount(0, 50)).toBe(1);
  });

  it('slices a page out of the full order, including a short last page', () => {
    expect(pageBounds(3, 50, 14_848)).toEqual({ start: 100, end: 150 });
    expect(pageBounds(297, 50, 14_848)).toEqual({ start: 14_800, end: 14_848 });
    expect(pageBounds(1, 50, 0)).toEqual({ start: 0, end: 0 });
  });

  it('labels the rows on a page', () => {
    expect(rowsLabel(2, 50, 14_848)).toBe('Rows 51–100 of 14,848');
    expect(rowsLabel(297, 50, 14_848)).toBe('Rows 14,801–14,848 of 14,848');
    expect(rowsLabel(1, 50, 0)).toBe('No rows');
  });

  it('finds the page holding a row', () => {
    expect(pageOfIndex(0, 50)).toBe(1);
    expect(pageOfIndex(49, 50)).toBe(1);
    expect(pageOfIndex(50, 50)).toBe(2);
  });
});

describe('clampPage', () => {
  it('keeps the same page after a refresh if it still exists', () => {
    expect(clampPage(3, 14_800, 50)).toBe(3);
  });

  it('moves to the last page when a refresh removes the current one', () => {
    expect(clampPage(297, 14_700, 50)).toBe(294);
    expect(clampPage(5, 0, 50)).toBe(1);
  });

  it('handles typed input that is out of range or not a number', () => {
    expect(clampPage(0, 1_000, 50)).toBe(1);
    expect(clampPage(999, 1_000, 50)).toBe(20);
    expect(clampPage(Number.NaN, 1_000, 50)).toBe(1);
  });
});

describe('navigate', () => {
  it('crosses to the next page with ↓ on the last row, and back with ↑ on the first', () => {
    expect(navigate('down', 49, 50, 200)).toEqual({ index: 50, page: 2 });
    expect(navigate('up', 50, 50, 200)).toEqual({ index: 49, page: 1 });
  });

  it('stops at the ends of the list', () => {
    expect(navigate('down', 199, 50, 200)).toEqual({ index: 199, page: 4 });
    expect(navigate('up', 0, 50, 200)).toEqual({ index: 0, page: 1 });
  });

  it('changes page with Page Up/Down and focuses its first row', () => {
    expect(navigate('pageDown', 10, 50, 200)).toEqual({ index: 50, page: 2 });
    expect(navigate('pageUp', 120, 50, 200)).toEqual({ index: 50, page: 2 });
    expect(navigate('pageDown', 160, 50, 200)).toEqual({ index: 160, page: 4 });
  });

  it('goes to the first or last row of the whole list with Home/End', () => {
    expect(navigate('home', 120, 50, 200)).toEqual({ index: 0, page: 1 });
    expect(navigate('end', 3, 50, 200)).toEqual({ index: 199, page: 4 });
  });
});
