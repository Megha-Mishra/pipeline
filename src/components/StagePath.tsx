import { formatCount } from '../domain/format';
import { STAGES, type Stage } from '../domain/types';
import { stageKey } from './StageBadge';

interface StagePathProps {
  counts: Record<Stage, number>;
  active: Stage | null;
  onSelect: (stage: Stage | null) => void;
  /** Stages to show. Today omits Won and Lost, which are not part of that work list. */
  stages?: readonly Stage[];
}

/**
 * The pipeline as a row of equal-width chevrons with each stage's count in the current view.
 * Stages with deals share the width equally; empty ones shrink to a narrow but still labelled, clickable segment.
 * The chevron shape is on an inner element, so the button's focus ring is never clipped.
 */
export function StagePath({ counts, active, onSelect, stages = STAGES }: StagePathProps) {
  return (
    <section className="stagepath" aria-label="Stages in this view. Choose one to filter">
      {stages.map((stage) => (
        <button
          key={stage}
          type="button"
          aria-pressed={active === stage}
          className={`stagepath-step stagepath-step--${stageKey(stage)}${counts[stage] === 0 ? ' stagepath-step--empty' : ''}${active === stage ? ' stagepath-step--active' : ''}`}
          onClick={() => onSelect(active === stage ? null : stage)}
          title={active === stage ? `Showing only ${stage}. Click to show all stages` : `Show only ${stage} (press ${STAGES.indexOf(stage) + 1} to move deals here)`}
        >
          <span className="stagepath-shape">
            <span className="stagepath-name">{stage}</span>
            <span className="stagepath-count">{formatCount(counts[stage])}</span>
          </span>
        </button>
      ))}
    </section>
  );
}
