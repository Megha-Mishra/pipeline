import { describe, expect, it } from 'vitest';
import { makeDeal, ME, NOW } from '../test/helpers';
import { leftViewMessage, updatedLine } from './leftView';

describe('leftViewMessage', () => {
  it('names the teammate who moved it', () => {
    const deal = makeDeal('D-1', { stage: 'Contacted', updatedBy: 'Manish Agarwal' });
    expect(leftViewMessage(deal, ME, 'cleanup')).toBe('Manish moved it to Contacted. Leaves this view on refresh');
  });

  it('leaves out the name for the viewer’s own move', () => {
    const deal = makeDeal('D-1', { stage: 'Lost', updatedBy: ME });
    expect(leftViewMessage(deal, ME, 'cleanup')).toBe('Moved to Lost. Leaves this view on refresh');
  });

  it('explains a reassignment in views of the viewer’s own deals', () => {
    const taken = makeDeal('D-1', { owner: 'Ravi Kumar', updatedBy: 'Ravi Kumar' });
    expect(leftViewMessage(taken, ME, 'mine')).toBe('Ravi took it over. Leaves this view on refresh');
    const given = makeDeal('D-2', { owner: 'Ravi Kumar', updatedBy: 'Meera Iyer' });
    expect(leftViewMessage(given, ME, 'today')).toBe('Meera reassigned it to Ravi. Leaves this view on refresh');
  });
});

describe('updatedLine', () => {
  const HOUR = 3_600_000;
  it('says when and by whom, calling the viewer "you"', () => {
    expect(updatedLine(makeDeal('D-1', { updatedAt: NOW - 2 * 24 * HOUR, updatedBy: ME }), ME, NOW)).toBe('Updated 2 days ago by you');
    expect(updatedLine(makeDeal('D-1', { updatedAt: NOW - 20 * HOUR, updatedBy: 'Ravi Kumar' }), ME, NOW)).toBe('Updated yesterday by Ravi');
    expect(updatedLine(makeDeal('D-1', { updatedAt: NOW - 3 * HOUR, updatedBy: 'Ravi Kumar' }), ME, NOW)).toBe('Updated 3h ago by Ravi');
    expect(updatedLine(makeDeal('D-1', { updatedAt: NOW - 10_000, updatedBy: ME }), ME, NOW)).toBe('Updated just now by you');
  });
});
