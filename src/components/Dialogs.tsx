import type { KeyboardEvent } from 'react';
import { formatCount } from '../domain/format';
import { STAGES, firstName, type Stage } from '../domain/types';
import type { PipelineEngine } from '../sync/engine';
import { Modal } from './Modal';
import { StageBadge } from './StageBadge';

export function StagePicker({ count, current, onPick, onClose }: { count: number; current: Stage | null; onPick: (s: Stage) => void; onClose: () => void }) {
  const firstChoice = STAGES.find((s) => s !== current);
  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = Number(e.key);
    if (n >= 1 && n <= STAGES.length && STAGES[n - 1] !== current) {
      e.preventDefault();
      onPick(STAGES[n - 1]);
    }
  };
  return (
    <Modal
      title={count === 1 ? 'Move deal to…' : `Move ${formatCount(count)} deals to…`}
      description="Press a number, or use Tab and Enter. Esc closes."
      onClose={onClose}
      onKeyDown={handleKey}
      width={360}
    >
      <div className="picker">
        {STAGES.map((stage, i) => (
          <button
            key={stage}
            type="button"
            className="picker-item"
            disabled={stage === current}
            data-autofocus={stage === firstChoice ? true : undefined}
            onClick={() => onPick(stage)}
          >
            <kbd>{i + 1}</kbd>
            <StageBadge stage={stage} />
            {stage === current && <span className="picker-current">Current</span>}
          </button>
        ))}
      </div>
    </Modal>
  );
}

export function ConfirmMove({ count, stage, onConfirm, onClose }: { count: number; stage: Stage; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal
      title={`Move ${formatCount(count)} deals to ${stage}?`}
      description="This runs in the background in batches of 200. You can keep working, stop it midway, and undo the deals it moved afterwards."
      onClose={onClose}
    >
      <div className="modal-actions">
        <button type="button" className="btn btn--primary" data-autofocus onClick={onConfirm}>
          Move {formatCount(count)} deals
        </button>
        <button type="button" className="btn btn--outline" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function ConflictDialog({ engine, id, onClose }: { engine: PipelineEngine; id: string; onClose: () => void }) {
  const row = engine.getRow(id);
  const status = row?.status;
  if (!row || status?.kind !== 'conflict') {
    return (
      <Modal title="Already resolved" description="This deal no longer has a conflict. Nothing else to do." onClose={onClose}>
        <div className="modal-actions">
          <button type="button" className="btn btn--primary" onClick={onClose}>
            Close
          </button>
        </div>
      </Modal>
    );
  }
  const by = firstName(status.by);
  const choose = (choice: 'mine' | 'theirs') => {
    engine.resolveConflict(id, choice);
    onClose();
  };
  return (
    <Modal
      title={`${row.deal.company} changed while you were saving`}
      description={`You and ${by} both changed the stage. Nothing was overwritten. Choose which one stays.`}
      onClose={onClose}
      width={480}
    >
      <div className="conflict-grid">
        <div className="conflict-card">
          <span className="conflict-label">Yours</span>
          <StageBadge stage={status.mine} />
        </div>
        <div className="conflict-card conflict-card--theirs">
          <span className="conflict-label">{by}'s, saved now</span>
          <StageBadge stage={status.theirs} />
        </div>
      </div>
      <p className="modal-note">Any other fields {by} changed were kept.</p>
      <div className="modal-actions">
        <button type="button" className="btn btn--primary" data-autofocus onClick={() => choose('theirs')}>
          Keep {by}'s
        </button>
        <button type="button" className="btn btn--outline" onClick={() => choose('mine')}>
          Apply mine
        </button>
      </div>
    </Modal>
  );
}

const SHORTCUTS: Array<[string, string]> = [
  ['↑ ↓  or  J K', 'Move between deals (continues onto the next or previous page)'],
  ['Page Up / Down', 'Previous or next page'],
  ['Home / End', 'First or last deal in the whole list'],
  ['X  or  Space', 'Select the focused deal'],
  ['Shift + ↑ ↓', 'Extend the selection'],
  ['Ctrl/⌘ + A', 'Select all matching deals'],
  ['1 – 7', 'Move focused or selected deals to that stage'],
  ['M', 'Open the stage picker'],
  ['R / Shift + R', 'Retry this save / retry all failed'],
  ['Enter', 'Resolve a conflict on the focused deal'],
  ['Ctrl/⌘ + Z', 'Undo the last move'],
  ['/', 'Search'],
  ['G then T, M, A, C', 'Today, My deals, All deals, Cleanup'],
  ['Shift + S', 'Simulation controls'],
  ['Esc', 'Clear selection or close'],
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} width={520}>
      <dl className="shortcuts">
        {SHORTCUTS.map(([key, action]) => (
          <div key={key} className="shortcut">
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <div className="modal-actions">
        <button type="button" className="btn btn--primary" data-autofocus onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}
