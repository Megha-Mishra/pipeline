import { FakeServer } from '../api/fakeServer';
import type { Deal, Stage } from '../domain/types';
import { PipelineEngine } from '../sync/engine';

export const NOW = new Date('2026-11-20T12:00:00').getTime();
export const ME = 'Priya Sharma';

export function makeDeal(id: string, patch: Partial<Deal> = {}): Deal {
  return {
    id,
    company: `Company ${id}`,
    city: 'Pune',
    licences: 10,
    value: 100_000,
    stage: 'Contacted',
    owner: ME,
    closeDate: NOW + 30 * 86_400_000,
    nextFollowUpAt: null,
    lastActivityAt: NOW - 86_400_000,
    updatedAt: NOW - 86_400_000,
    updatedBy: ME,
    version: 1,
    lastRequestId: null,
    ...patch,
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Engine + server with a manual clock: network calls wait until flush() is
 * called, so tests decide exactly what happens while a save is in flight.
 */
export async function setup(deals: Deal[]) {
  const waiting: Array<() => void> = [];
  const server = new FakeServer(deals, {
    sleep: () => new Promise<void>((resolve) => waiting.push(resolve)),
    random: () => 0.5,
    now: () => NOW,
    config: { failureRate: 0 },
  });
  const engine = new PipelineEngine(server, ME, () => NOW);
  const flush = async () => {
    await tick();
    while (waiting.length) {
      waiting.splice(0).forEach((resolve) => resolve());
      await tick();
    }
  };
  const loading = engine.load();
  await flush();
  await loading;
  const stageOf = (id: string): Stage => engine.getRow(id)!.deal.stage;
  return { server, engine, flush, stageOf };
}
