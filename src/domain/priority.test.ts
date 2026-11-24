import { describe, expect, it } from 'vitest';
import { prioritize } from './priority';
import { makeDeal, ME, NOW } from '../test/helpers';

const DAY = 86_400_000;

describe('prioritize', () => {
  it('ignores closed deals', () => {
    expect(prioritize(makeDeal('a', { stage: 'Won', closeDate: NOW }), NOW, ME)).toBeNull();
  });

  it('ignores deals with nothing to do today', () => {
    expect(prioritize(makeDeal('a'), NOW, ME)).toBeNull();
  });

  it('flags a close date of today as the most urgent reason', () => {
    const p = prioritize(makeDeal('a', { closeDate: NOW, nextFollowUpAt: NOW - 2 * DAY }), NOW, ME);
    expect(p).toMatchObject({ reason: 'Close date today', tone: 'urgent' });
  });

  it('flags late follow-ups and stale proposals', () => {
    expect(prioritize(makeDeal('a', { nextFollowUpAt: NOW - 3 * DAY }), NOW, ME)?.reason).toBe('Follow-up 3 days late');
    expect(prioritize(makeDeal('b', { stage: 'Proposal Sent', lastActivityAt: NOW - 25 * DAY }), NOW, ME)?.reason).toBe('No activity in 25 days');
  });

  it('treats very old close dates as clean-up work, not today work', () => {
    expect(prioritize(makeDeal('a', { closeDate: NOW - 120 * DAY }), NOW, ME)).toBeNull();
  });

  it('surfaces deals a teammate changed today', () => {
    expect(prioritize(makeDeal('a', { updatedAt: NOW, updatedBy: 'Ravi Kumar' }), NOW, ME)?.reason).toBe('Changed today by Ravi');
  });

  it('ranks higher-value deals first when the reason is the same', () => {
    const small = prioritize(makeDeal('a', { closeDate: NOW, value: 50_000 }), NOW, ME)!;
    const big = prioritize(makeDeal('b', { closeDate: NOW, value: 5_000_000 }), NOW, ME)!;
    expect(big.score).toBeGreaterThan(small.score);
  });
});
