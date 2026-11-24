import type { Stage } from '../domain/types';
import type { BulkJob } from '../sync/engine';

/** What the current bulk job did to one deal, shown in that deal's Status cell. */
export type BulkOutcome =
  | { kind: 'moved'; to: Stage; isUndo: boolean }
  | { kind: 'failed' }
  | { kind: 'skipped'; by: string; theirs: Stage };

/**
 * Indexes a bulk job's results by deal ID. Built once per batch (not per row), so a job
 * over 15,000 deals costs one pass each time a batch of 200 comes back.
 */
export function bulkOutcomes(job: BulkJob | null): Map<string, BulkOutcome> {
  const map = new Map<string, BulkOutcome>();
  if (!job) return map;
  for (const item of job.succeeded) map.set(item.id, { kind: 'moved', to: item.to, isUndo: job.isUndo });
  for (const item of job.failed) map.set(item.id, { kind: 'failed' });
  for (const item of job.conflicts) map.set(item.id, { kind: 'skipped', by: item.by, theirs: item.theirs });
  return map;
}

/** Changes whenever the job's results change, for use as a memo key. */
export function bulkOutcomeKey(job: BulkJob | null): string {
  if (!job) return '';
  return `${job.id}:${job.processed}:${job.succeeded.length}:${job.failed.length}:${job.conflicts.length}:${job.status}`;
}
