import type { Stage } from '../domain/types';
import { ChevronIcon } from './Icons';

export const stageKey = (stage: Stage): string => stage.toLowerCase().replace(/\s+/g, '-');

/** Stage as a coloured dot plus its name. The name is always there, so colour is never the only signal. */
export function StageBadge({ stage, chevron = false }: { stage: Stage; chevron?: boolean }) {
  return (
    <span className="stage">
      <span className={`stage-dot stage-dot--${stageKey(stage)}`} aria-hidden="true" />
      {stage}
      {chevron && <ChevronIcon />}
    </span>
  );
}
