import { describe, expect, it } from 'vitest';
import { formatAgo } from './format';

const NOW = new Date('2026-11-20T15:00:00').getTime();
const MIN = 60_000;

describe('formatAgo', () => {
  it('uses minutes and hours within today', () => {
    expect(formatAgo(NOW - 20_000, NOW)).toBe('Just now');
    expect(formatAgo(NOW - 11 * MIN, NOW)).toBe('11m ago');
    expect(formatAgo(NOW - 3 * 60 * MIN, NOW)).toBe('3h ago');
  });

  it('falls back to days before today', () => {
    expect(formatAgo(NOW - 20 * 60 * MIN, NOW)).toBe('Yesterday');
    expect(formatAgo(NOW - 5 * 24 * 60 * MIN, NOW)).toBe('5 days ago');
  });
});
