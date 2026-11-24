import { describe, expect, it } from 'vitest';
import { makeDeal, setup } from '../test/helpers';

describe('single moves', () => {
  it('shows the move immediately, then confirms it', async () => {
    const { engine, server, flush, stageOf } = await setup([makeDeal('a')]);
    engine.move(['a'], 'Demo Done');
    expect(stageOf('a')).toBe('Demo Done');
    expect(engine.getRow('a')!.status?.kind).toBe('saving');
    await flush();
    expect(engine.getRow('a')!.status).toBeNull();
    expect(server.peek('a')!.stage).toBe('Demo Done');
  });

  it('reverts a failed save, tells the user, and retries', async () => {
    const { engine, server, flush, stageOf } = await setup([makeDeal('a')]);
    server.failNext('network');
    engine.move(['a'], 'Demo Done');
    await flush();
    expect(stageOf('a')).toBe('Contacted');
    expect(engine.getRow('a')!.status?.kind).toBe('failed');
    expect(engine.toasts.some((t) => t.key === 'failures')).toBe(true);

    engine.retry('a');
    await flush();
    expect(stageOf('a')).toBe('Demo Done');
    expect(engine.failedIds).toHaveLength(0);
    expect(engine.toasts.some((t) => t.key === 'failures')).toBe(false);
  });

  it('does not apply a change twice when a lost response is retried', async () => {
    const { engine, server, flush } = await setup([makeDeal('a')]);
    server.failNext('lost'); // server commits, client sees an error
    engine.move(['a'], 'Demo Done');
    await flush();
    expect(engine.getRow('a')!.status?.kind).toBe('failed');
    expect(server.peek('a')!.version).toBe(2);

    engine.retry('a');
    await flush();
    expect(server.peek('a')!.version).toBe(2);
    expect(engine.getRow('a')!.status).toBeNull();
    expect(engine.getRow('a')!.deal.stage).toBe('Demo Done');
  });

  it('serialises rapid moves on one deal and keeps the last one', async () => {
    const { engine, server, flush, stageOf } = await setup([makeDeal('a')]);
    engine.move(['a'], 'Demo Done');
    engine.move(['a'], 'Proposal Sent');
    engine.move(['a'], 'Negotiation');
    expect(stageOf('a')).toBe('Negotiation');
    expect(server.requestCount).toBe(1); // only the first save is on the wire
    await flush();
    expect(server.peek('a')!.stage).toBe('Negotiation');
    expect(server.requestCount).toBe(2); // the middle move was never sent
    expect(engine.getRow('a')!.status).toBeNull();
  });

  it('does not report a false conflict after a lost response followed by another move', async () => {
    const { engine, server, flush } = await setup([makeDeal('a')]);
    server.failNext('lost');
    engine.move(['a'], 'Demo Done');
    engine.move(['a'], 'Proposal Sent'); // queued behind the first
    await flush();
    expect(engine.getRow('a')!.status).toBeNull();
    expect(server.peek('a')!.stage).toBe('Proposal Sent');
  });
});

describe('teammates and conflicts', () => {
  it('turns a clashing teammate change into a conflict instead of overwriting it', async () => {
    const { engine, server, flush, stageOf } = await setup([makeDeal('a')]);
    engine.move(['a'], 'Demo Done');
    server.teammateEdit('a', { stage: 'Lost' }); // lands while our save is in flight
    await flush();
    expect(server.peek('a')!.stage).toBe('Lost');
    expect(stageOf('a')).toBe('Lost');
    const status = engine.getRow('a')!.status;
    expect(status).toMatchObject({ kind: 'conflict', mine: 'Demo Done', theirs: 'Lost' });

    engine.resolveConflict('a', 'mine');
    await flush();
    expect(server.peek('a')!.stage).toBe('Demo Done');
  });

  it('merges a teammate change to a different field', async () => {
    const { engine, server, flush } = await setup([makeDeal('a')]);
    engine.move(['a'], 'Demo Done');
    server.teammateEdit('a', { owner: 'Ravi Kumar' });
    await flush();
    expect(engine.getRow('a')!.status).toBeNull();
    expect(server.peek('a')).toMatchObject({ stage: 'Demo Done', owner: 'Ravi Kumar' });
  });

  it('ignores data older than what it already has', async () => {
    const { engine, server } = await setup([makeDeal('a')]);
    const old = server.peek('a')!;
    server.teammateEdit('a', { stage: 'Won' });
    engine.receive(old, 'Ravi Kumar');
    expect(engine.getRow('a')!.deal.stage).toBe('Won');
  });

  it('turns undo into a conflict when a teammate changed the deal afterwards', async () => {
    const { engine, server, flush } = await setup([makeDeal('a')]);
    engine.move(['a'], 'Demo Done');
    await flush();
    server.teammateEdit('a', { stage: 'Negotiation' });
    engine.undo();
    await flush();
    expect(server.peek('a')!.stage).toBe('Negotiation');
    expect(engine.getRow('a')!.status).toMatchObject({ kind: 'conflict', mine: 'Contacted', theirs: 'Negotiation' });
  });

  it('undoes a confirmed move', async () => {
    const { engine, server, flush } = await setup([makeDeal('a')]);
    engine.move(['a'], 'Demo Done');
    await flush();
    engine.undo();
    await flush();
    expect(server.peek('a')!.stage).toBe('Contacted');
  });
});

describe('bulk moves', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => makeDeal(`d${i}`));

  async function runUntilDone(flush: () => Promise<void>, isRunning: () => boolean) {
    for (let i = 0; i < 20 && isRunning(); i++) await flush();
  }

  it('reports partial failures and conflicts, and undo only reverts its own changes', async () => {
    const deals = many(450); // chunks of 200, 200, 50
    const { engine, server, flush } = await setup(deals);
    server.failNext('network'); // first chunk fails as a whole
    engine.move(deals.map((d) => d.id), 'Lost');
    server.teammateEdit('d300', { stage: 'Won' }); // lands before chunk 2 is applied
    await runUntilDone(flush, () => engine.bulk?.status === 'running');

    const job = engine.bulk!;
    expect(job.status).toBe('done');
    expect(job.failed).toHaveLength(200);
    expect(job.conflicts).toEqual([expect.objectContaining({ id: 'd300', theirs: 'Won' })]);
    expect(job.succeeded).toHaveLength(249);
    expect(engine.getRow('d0')!.status?.kind).toBe('failed');

    engine.undoBulk(job.id);
    await runUntilDone(flush, () => engine.bulk?.status === 'running');
    expect(server.peek('d250')!.stage).toBe('Contacted');
    expect(server.peek('d300')!.stage).toBe('Won');
    expect(server.peek('d0')!.stage).toBe('Contacted');
  });

  it('retries only the failed part of a bulk move', async () => {
    const deals = many(300);
    const { engine, server, flush } = await setup(deals);
    server.failNext('network');
    engine.move(deals.map((d) => d.id), 'Lost');
    await runUntilDone(flush, () => engine.bulk?.status === 'running');
    expect(engine.bulk!.failed).toHaveLength(200);

    engine.retryBulkFailed();
    await runUntilDone(flush, () => engine.bulk?.status === 'running');
    expect(engine.bulk!.succeeded).toHaveLength(200);
    expect(deals.every((d) => server.peek(d.id)!.stage === 'Lost')).toBe(true);
    expect(engine.failedIds).toHaveLength(0);
  });

  it('stops dispatching new chunks when cancelled', async () => {
    const deals = many(1000); // 5 chunks, 3 in flight at once
    const { engine, server, flush } = await setup(deals);
    engine.move(deals.map((d) => d.id), 'Lost');
    engine.cancelBulk();
    await runUntilDone(flush, () => engine.bulk?.status === 'running');
    const job = engine.bulk!;
    expect(job.status).toBe('cancelled');
    expect(job.succeeded).toHaveLength(600);
    expect(job.notAttempted).toBe(400);
    expect(server.peek('d999')!.stage).toBe('Contacted');
    expect(engine.getRow('d999')!.status).toBeNull();
  });
});
