import { describe, expect, it } from 'vitest';
import { describeSort } from './listPosition';

describe('describeSort', () => {
  it('says what the order is in plain words', () => {
    expect(describeSort('closeDate', 'asc')).toBe('Sorted by close date, oldest first.');
    expect(describeSort('priority', 'desc')).toBe('Sorted by priority, most urgent first.');
    expect(describeSort('company', 'asc')).toBe('Sorted by deal name, A to Z.');
  });
});
