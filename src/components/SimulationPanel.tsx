import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { DEFAULT_SIM_CONFIG, type SimConfig } from '../api/fakeServer';
import { CloseIcon } from './Icons';

interface SimulationPanelProps {
  config: SimConfig;
  requests: number;
  hasFocusedDeal: boolean;
  onChange: (patch: Partial<SimConfig>) => void;
  onTeammateEditFocused: () => void;
  onTeammateBurst: () => void;
  onClose: () => void;
}

/** Controls for the fake API, so reviewers can break things on purpose. */
export function SimulationPanel(p: SimulationPanelProps) {
  const { config } = p;
  const titleRef = useRef<HTMLHeadingElement>(null);
  const isDefault = (Object.keys(DEFAULT_SIM_CONFIG) as Array<keyof SimConfig>).every((k) => config[k] === DEFAULT_SIM_CONFIG[k]);

  // Not a modal: the grid stays usable. Focus moves in on open and back to where it was on close.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    titleRef.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  const handleKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      p.onClose();
    }
  };

  return (
    <aside id="simulation-panel" className="sim" aria-labelledby="simulation-title" onKeyDown={handleKeyDown}>
      <div className="sim-head">
        <h2 id="simulation-title" className="sim-title" ref={titleRef} tabIndex={-1}>
          Simulation
        </h2>
        <button type="button" className="icon-btn" aria-label="Close simulation controls" onClick={p.onClose}>
          <CloseIcon />
        </button>
      </div>
      <p className="sim-note">Controls the fake API. Changes apply immediately. Esc closes.</p>

      <Slider label="Failed saves" value={Math.round(config.failureRate * 100)} min={0} max={100} step={5} unit="%" onChange={(v) => p.onChange({ failureRate: v / 100 })} />
      <Slider
        label="Fastest save"
        value={config.minDelayMs}
        min={0}
        max={5000}
        step={100}
        unit=" ms"
        onChange={(v) => p.onChange({ minDelayMs: v, maxDelayMs: Math.max(v, config.maxDelayMs) })}
      />
      <Slider
        label="Slowest save"
        value={config.maxDelayMs}
        min={0}
        max={5000}
        step={100}
        unit=" ms"
        onChange={(v) => p.onChange({ maxDelayMs: v, minDelayMs: Math.min(v, config.minDelayMs) })}
      />
      <Slider label="Teammate edits per minute" value={config.teammateEditsPerMinute} min={0} max={300} step={10} unit="" onChange={(v) => p.onChange({ teammateEditsPerMinute: v })} />

      <label className="sim-check">
        <input type="checkbox" checked={config.offline} onChange={(e) => p.onChange({ offline: e.target.checked })} />
        Go offline
      </label>

      <button type="button" className="btn btn--outline" disabled={isDefault} onClick={() => {
          p.onChange(DEFAULT_SIM_CONFIG);
          // The button disables itself, so keep focus inside the panel rather than losing it to the page.
          titleRef.current?.focus();
        }}>
        Reset to brief defaults
      </button>
      <p className="sim-note">Brief defaults: saves take 0.3–1.5 s and 10% fail, 30 teammate edits a minute, online.</p>

      <div className="sim-actions">
        <button type="button" className="btn btn--conflict-outline" disabled={!p.hasFocusedDeal} onClick={p.onTeammateEditFocused}>
          Teammate edits the focused deal
        </button>
        <button type="button" className="btn btn--outline" onClick={p.onTeammateBurst}>
          20 teammate edits now
        </button>
      </div>
      <p className="sim-note">
        Requests sent: {p.requests}. About 30% of failed saves are applied on the server but the response is lost, to exercise
        idempotent retries.
      </p>
    </aside>
  );
}

function Slider(p: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="sim-field">
      <div className="sim-row">
        <label htmlFor={id}>{p.label}</label>
        <span className="sim-value">
          {p.value}
          {p.unit}
        </span>
      </div>
      <input id={id} type="range" min={p.min} max={p.max} step={p.step} value={p.value} onChange={(e) => p.onChange(Number(e.target.value))} />
    </div>
  );
}
