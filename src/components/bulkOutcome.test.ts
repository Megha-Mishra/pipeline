import { describe, expect, it } from 'vitest';
import type { BulkJob } from '../sync/engine';
import { bulkOutcomeKey, bulkOutcomes } from './bulkOutcome';

const job = (patch: Partial<BulkJob> = {}): BulkJob => ({
  id: 'job-1',
  label: 'Move 4 deals to Lost',
  total: 4,
  processed: 3,
  succeeded: [{ id: 'D-1', from: 'Contacted', to: 'Lost' }],
  failed: [{ id: 'D-2', to: 'Lost' }],
  conflicts: [{ id: 'D-3', mine: 'Lost', theirs: 'Negotiation', by: 'Anil Mehta' }],
  unchanged: 0,
  notAttempted: 0,
  status: 'running',
  isUndo: false,
  startedAt: 0,
  finishedAt: null,
  ...patch,
});

describe('bulkOutcomes', () => {
  it('reports moved, failed and skipped deals, and nothing for deals not reached yet', () => {
    const map = bulkOutcomes(job());
    expect(map.get('D-1')).toEqual({ kind: 'moved', to: 'Lost', isUndo: false });
    expect(map.get('D-2')).toEqual({ kind: 'failed' });
    expect(map.get('D-3')).toEqual({ kind: 'skipped', by: 'Anil Mehta', theirs: 'Negotiation' });
    expect(map.has('D-4')).toBe(false);
  });

  it('is empty without a job', () => {
    expect(bulkOutcomes(null).size).toBe(0);
  });

  it('changes its key as results come in', () => {
    expect(bulkOutcomeKey(job())).not.toBe(bulkOutcomeKey(job({ processed: 4 })));
    expect(bulkOutcomeKey(null)).toBe('');
  });
});
