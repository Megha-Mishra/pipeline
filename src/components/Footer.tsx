import type { SimConfig } from '../api/fakeServer';
import { SlidersIcon } from './Icons';

interface FooterProps {
  config: SimConfig;
  simOpen: boolean;
  onToggleSim: () => void;
  onShowShortcuts: () => void;
}

/** Slim footer: the most useful keys, the shortcuts list and the Simulation drawer. */
export function Footer({ config, simOpen, onToggleSim, onShowShortcuts }: FooterProps) {
  const fmt = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  return (
    <footer className="footer">
      <button type="button" className="footer-link" onClick={onShowShortcuts} title="Keyboard shortcuts (?)">
        <kbd>?</kbd> Keyboard shortcuts
      </button>
      <span className="footer-position">
        <kbd>↑</kbd> <kbd>↓</kbd> move, across pages. <kbd>PgUp</kbd> <kbd>PgDn</kbd> change page. <kbd>Home</kbd> <kbd>End</kbd> first or last deal
      </span>
      <span className="footer-spacer" />
      <button
        type="button"
        className="footer-link"
        aria-expanded={simOpen}
        aria-controls="simulation-panel"
        title="Simulation controls (Shift+S)"
        onClick={onToggleSim}
      >
        <SlidersIcon />
        Simulation: {Math.round(config.failureRate * 100)}% failures, {fmt(config.minDelayMs)}–{fmt(config.maxDelayMs)}
        {config.offline ? ', offline' : ''}
      </button>
    </footer>
  );
}
