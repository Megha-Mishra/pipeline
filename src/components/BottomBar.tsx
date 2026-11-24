import { useEffect, useRef } from 'react';
import { formatCount } from '../domain/format';
import type { BulkJob } from '../sync/engine';
import type { Selection } from '../view/selection';

interface SelectionPart {
  selection: Selection;
  count: number;
  matching: number;
  onSelectAll: () => void;
  onMove: () => void;
  onMoveToLost: (() => void) | null;
  onClear: () => void;
}

interface JobPart {
  job: BulkJob;
  cancelling: boolean;
  canUndo: boolean;
  onCancel: () => void;
  onUndo: () => void;
  onRetryFailed: () => void;
  onReviewSkipped: () => void;
  onDismiss: () => void;
}

interface BottomBarProps {
  selection: SelectionPart | null;
  job: JobPart | null;
  /** Reports the bar's height (0 when hidden) so an error can sit above it. */
  onHeight: (px: number) => void;
}

/**
 * Floating bar for selection actions and bulk moves. When both apply (rows selected while
 * a bulk move runs), the job stays on top so its progress is never hidden.
 */
export function BottomBar({ selection, job, onHeight }: BottomBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const visible = selection !== null || job !== null;

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      onHeight(0);
      return;
    }
    const observer = new ResizeObserver(() => onHeight(el.offsetHeight));
    observer.observe(el);
    onHeight(el.offsetHeight);
    return () => {
      observer.disconnect();
      onHeight(0);
    };
  }, [visible, onHeight]);

  if (!visible) return null;
  return (
    <div className="bottombar" ref={ref}>
      {job && <JobSection {...job} />}
      {selection && <SelectionSection {...selection} />}
    </div>
  );
}

function SelectionSection(p: SelectionPart) {
  const all = p.selection.mode === 'all';
  return (
    <section className="bottombar-section" aria-label="Selection actions">
      <div className="bottombar-row">
        <span className="bottombar-title" aria-live="polite">
          {all ? `All ${formatCount(p.count)} matching deals selected` : `${formatCount(p.count)} selected`}
        </span>
        {all && <span className="bottombar-note">Deals that leave the filter before the move runs are skipped.</span>}
        <span className="bottombar-spacer" />
        {!all && p.matching > p.count && (
          <button type="button" className="btn btn--dark-ghost" onClick={p.onSelectAll} title="Ctrl/⌘+A">
            Select all {formatCount(p.matching)} matching
          </button>
        )}
        {p.onMoveToLost && (
          <button type="button" className="btn btn--dark-primary" onClick={p.onMoveToLost}>
            Move to Lost
          </button>
        )}
        <button type="button" className={p.onMoveToLost ? 'btn btn--dark-outline' : 'btn btn--dark-primary'} onClick={p.onMove} title="M">
          Move to stage <kbd>M</kbd>
        </button>
        <button type="button" className="btn btn--dark-ghost" onClick={p.onClear} title="Esc">
          Clear <kbd>Esc</kbd>
        </button>
      </div>
    </section>
  );
}

function JobSection(p: JobPart) {
  const { job } = p;
  const running = job.status === 'running';
  const moved = job.succeeded.length + job.unchanged;
  const seconds = Math.max(1, Math.round(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000));
  const title = running ? job.label.replace(/^Move /, 'Moving ') : `${job.status === 'cancelled' ? 'Stopped' : 'Finished'}: ${job.label}`;
  const sub = running
    ? `${formatCount(job.processed)} of ${formatCount(job.total)} done. Keep working, it runs in the background.`
    : `${formatCount(job.processed)} of ${formatCount(job.total)} processed in ${seconds} s.${job.notAttempted ? ` ${formatCount(job.notAttempted)} weren't attempted and are unchanged.` : ''}`;

  return (
    <section className="bottombar-section" aria-label="Bulk move">
      <div className="bottombar-row">
        <span className="bottombar-title">{title}</span>
        <span className="bottombar-note" aria-live="polite">
          {sub}
        </span>
        <span className="bottombar-spacer" />
        {running ? (
          <button type="button" className="btn btn--dark-outline" onClick={p.onCancel} disabled={p.cancelling}>
            {p.cancelling ? 'Stopping…' : 'Cancel'}
          </button>
        ) : (
          <button type="button" className="btn btn--dark-ghost" onClick={p.onDismiss}>
            Dismiss
          </button>
        )}
      </div>

      <div
        className="progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={job.total}
        aria-valuenow={job.processed}
        aria-label={`${formatCount(job.processed)} of ${formatCount(job.total)} processed`}
      >
        <div className="progress-moved" style={{ flexGrow: moved }} />
        <div className="progress-failed" style={{ flexGrow: job.failed.length }} />
        <div className="progress-skipped" style={{ flexGrow: job.conflicts.length }} />
        <div className="progress-rest" style={{ flexGrow: job.total - job.processed }} />
      </div>

      <div className="bottombar-row bottombar-counts">
        <span>
          <b className="count--moved">{formatCount(moved)}</b> {job.isUndo ? 'reverted' : 'moved'}
        </span>
        {!running && p.canUndo && job.succeeded.length > 0 && (
          <button type="button" className="btn btn--dark-outline btn--small" onClick={p.onUndo}>
            Undo these {formatCount(job.succeeded.length)}
          </button>
        )}
        <span>
          <b className="count--failed">{formatCount(job.failed.length)}</b> didn't save{running ? ', retry when done' : ''}
        </span>
        {!running && job.failed.length > 0 && (
          <button type="button" className="btn btn--dark-outline btn--small" onClick={p.onRetryFailed}>
            Retry {formatCount(job.failed.length)} failed
          </button>
        )}
        <span>
          <b className="count--skipped">{formatCount(job.conflicts.length)}</b> skipped, a teammate changed them
        </span>
        {!running && job.conflicts.length > 0 && (
          <button type="button" className="btn btn--dark-outline btn--small" onClick={p.onReviewSkipped}>
            Review {formatCount(job.conflicts.length)} skipped
          </button>
        )}
      </div>
    </section>
  );
}
