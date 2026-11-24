import { describe, expect, it } from 'vitest';
import { FakeServer, SaveError } from './fakeServer';
import { makeDeal, NOW } from '../test/helpers';

const instant = () => Promise.resolve();
const server = (opts = {}) => new FakeServer([makeDeal('a')], { sleep: instant, random: () => 0.5, now: () => NOW, config: { failureRate: 0 }, ...opts });

describe('FakeServer', () => {
  it('rejects a write whose expected value is stale', async () => {
    const s = server();
    const res = await s.update({ requestId: 'r1', dealId: 'a', changes: { stage: 'Won' }, expected: { stage: 'New Lead' } }, 'me');
    expect(res).toMatchObject({ status: 'conflict', fields: ['stage'] });
    expect(s.peek('a')!.stage).toBe('Contacted');
  });

  it('applies a repeated request ID only once', async () => {
    const s = server();
    const req = { requestId: 'r1', dealId: 'a', changes: { stage: 'Won' as const }, expected: { stage: 'Contacted' as const } };
    await s.update(req, 'me');
    await s.update(req, 'me');
    expect(s.peek('a')!.version).toBe(2);
  });

  it('can commit a write and still report a network error', async () => {
    const s = server();
    s.failNext('lost');
    await expect(
      s.update({ requestId: 'r1', dealId: 'a', changes: { stage: 'Won' }, expected: { stage: 'Contacted' } }, 'me'),
    ).rejects.toBeInstanceOf(SaveError);
    expect(s.peek('a')!.stage).toBe('Won');
  });

  it('holds teammate changes while offline and delivers them on reconnect', () => {
    const s = server();
    const seen: string[] = [];
    s.subscribe((e) => seen.push(e.deal.stage));
    s.setConfig({ offline: true });
    s.teammateEdit('a', { stage: 'Won' });
    expect(seen).toEqual([]);
    s.setConfig({ offline: false });
    expect(seen).toEqual(['Won']);
  });
});
