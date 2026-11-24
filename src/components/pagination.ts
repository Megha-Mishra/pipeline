import { formatCount } from '../domain/format';

export const PAGE_SIZES = [25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

/** At least one page, so an empty view still reads "Page 1 of 1". */
export function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

/** Keeps a page number in range, e.g. after a refresh shrinks the list or the user types 999. */
export function clampPage(page: number, total: number, size: number): number {
  const whole = Number.isFinite(page) ? Math.round(page) : 1;
  return Math.min(Math.max(1, whole), pageCount(total, size));
}

/** 1-based page that holds the row at a 0-based index. */
export function pageOfIndex(index: number, size: number): number {
  return Math.floor(Math.max(0, index) / size) + 1;
}

/** 0-based [start, end) of a page within the full, frozen row order. */
export function pageBounds(page: number, size: number, total: number): { start: number; end: number } {
  const start = Math.min((clampPage(page, total, size) - 1) * size, total);
  return { start, end: Math.min(start + size, total) };
}

/** "Rows 51–100 of 14,848". */
export function rowsLabel(page: number, size: number, total: number): string {
  if (total === 0) return 'No rows';
  const { start, end } = pageBounds(page, size, total);
  return `Rows ${formatCount(start + 1)}–${formatCount(end)} of ${formatCount(total)}`;
}

export type PageKey = 'down' | 'up' | 'pageDown' | 'pageUp' | 'home' | 'end';

/**
 * Where focus goes for a navigation key, across pages. Arrows step one row and cross a page edge
 * (↓ on a page's last row lands on the next page's first row); Page Up/Down change page and focus
 * its first row; Home/End go to the first/last row of the whole list.
 */
export function navigate(key: PageKey, index: number, size: number, total: number): { index: number; page: number } {
  if (total === 0) return { index: 0, page: 1 };
  const last = total - 1;
  const current = Math.min(Math.max(0, index), last);
  let next: number;
  switch (key) {
    case 'down':
      next = Math.min(last, current + 1);
      break;
    case 'up':
      next = Math.max(0, current - 1);
      break;
    case 'pageDown': {
      const page = Math.min(pageCount(total, size), pageOfIndex(current, size) + 1);
      next = page === pageOfIndex(current, size) ? current : (page - 1) * size;
      break;
    }
    case 'pageUp': {
      const page = Math.max(1, pageOfIndex(current, size) - 1);
      next = page === pageOfIndex(current, size) ? current : (page - 1) * size;
      break;
    }
    case 'home':
      next = 0;
      break;
    case 'end':
      next = last;
      break;
  }
  return { index: next, page: pageOfIndex(next, size) };
}
