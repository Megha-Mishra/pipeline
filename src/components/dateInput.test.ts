import { describe, expect, it } from 'vitest';
import { fromDateInput, toDateInput } from './dateInput';

describe('date input conversion', () => {
  it('round-trips a day', () => {
    expect(toDateInput(fromDateInput('2026-05-22'))).toBe('2026-05-22');
  });

  it('makes a "to" date include the whole day', () => {
    const start = fromDateInput('2026-11-23')!;
    const end = fromDateInput('2026-11-23', true)!;
    expect(end - start).toBe(86_400_000 - 1);
    expect(new Date(end).getDate()).toBe(23);
  });

  it('treats empty or malformed values as no limit', () => {
    expect(fromDateInput('')).toBeNull();
    expect(fromDateInput('23/11/2026')).toBeNull();
    expect(toDateInput(null)).toBe('');
  });
});
