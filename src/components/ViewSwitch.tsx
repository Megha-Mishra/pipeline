import { formatCount } from '../domain/format';
import type { TabId } from '../view/query';
import { CloseIcon } from './Icons';

interface ViewSwitchProps {
  active: TabId;
  counts: Record<TabId, number>;
  reviewLabel: string;
  onSelect: (tab: TabId) => void;
  onCloseReview: () => void;
}

const VIEWS: Array<{ id: TabId; label: string; hint: string }> = [
  { id: 'today', label: 'Today', hint: 'G then T' },
  { id: 'mine', label: 'My deals', hint: 'G then M' },
  { id: 'all', label: 'All deals', hint: 'G then A' },
  { id: 'cleanup', label: 'Quarter-end cleanup', hint: 'G then C' },
];

/** Segmented control for the views. The temporary Review list joins it while open. */
export function ViewSwitch(p: ViewSwitchProps) {
  return (
    <nav className="segmented" aria-label="Views">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          type="button"
          className={`segment ${p.active === v.id ? 'segment--active' : ''}`}
          aria-current={p.active === v.id ? 'page' : undefined}
          title={`${v.label} (${v.hint})`}
          onClick={() => p.onSelect(v.id)}
        >
          {v.label} <span className="segment-count">{formatCount(p.counts[v.id])}</span>
        </button>
      ))}
      {p.active === 'review' && (
        <span className="segment segment--active segment--review" aria-current="page">
          {p.reviewLabel} <span className="segment-count">{formatCount(p.counts.review)}</span>
          <button type="button" className="icon-btn icon-btn--small" aria-label="Close review" onClick={p.onCloseReview}>
            <CloseIcon />
          </button>
        </span>
      )}
    </nav>
  );
}
