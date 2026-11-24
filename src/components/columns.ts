import type { SortKey, TabId } from '../view/query';

export type ColumnKey = 'select' | 'deal' | 'reason' | 'owner' | 'stage' | 'value' | 'close' | 'overdue' | 'status';

export interface Column {
  key: ColumnKey;
  label: string;
  /** Minimum width in px. Columns with `grow` share the spare space. */
  min: number;
  grow?: number;
  sort?: SortKey;
  align?: 'right';
}

export interface ColumnLayout {
  columns: readonly Column[];
  /** CSS grid-template-columns value. */
  template: string;
  /** Sum of minimum widths; below this the grid scrolls sideways. */
  minWidth: number;
}

const COLUMNS: Record<ColumnKey, Column> = {
  select: { key: 'select', label: 'Select', min: 44 },
  deal: { key: 'deal', label: 'Deal', min: 168, grow: 1.2, sort: 'company' },
  reason: { key: 'reason', label: 'Why today', min: 200, grow: 1, sort: 'priority' },
  owner: { key: 'owner', label: 'Owner', min: 168, grow: 1, sort: 'owner' },
  stage: { key: 'stage', label: 'Stage', min: 148, grow: 0.8, sort: 'stage' },
  value: { key: 'value', label: 'Value', min: 104, grow: 0.6, sort: 'value', align: 'right' },
  // Fits the longest date, e.g. "24 Sept 2026".
  close: { key: 'close', label: 'Close date', min: 120, grow: 0.6, sort: 'closeDate' },
  // Overdue is the close date seen from the other side; sort by Close date instead, so only one header shows an arrow.
  overdue: { key: 'overdue', label: 'Overdue', min: 96, grow: 0.5 },
  // Spare width is spread across all columns, so no single column leaves a big gap; long text truncates with a tooltip.
  status: { key: 'status', label: 'Status', min: 220, grow: 1 },
};

/** When space runs out, these are hidden first. Everything else always shows. */
const DROP_ORDER: readonly ColumnKey[] = ['close', 'value', 'owner'];

const cache = new Map<string, ColumnLayout>();

/**
 * Picks the columns for a view and the available width.
 * Today and My deals only contain the viewer's own deals, so Owner is left out there.
 * Today adds the reason a deal needs attention; Quarter-end cleanup adds how overdue it is.
 * Layouts are cached by column set, so the same set always returns the same object
 * and memoised rows don't re-render when the window is resized.
 */
export function pickColumns(tab: TabId, width: number): ColumnLayout {
  const ownOnly = tab === 'today' || tab === 'mine';
  let keys: ColumnKey[] = [
    'select',
    'deal',
    ...(tab === 'today' ? ['reason' as const] : []),
    ...(ownOnly ? [] : ['owner' as const]),
    'stage',
    'value',
    'close',
    ...(tab === 'cleanup' ? ['overdue' as const] : []),
    'status',
  ];

  const sum = (ks: ColumnKey[]) => ks.reduce((total, k) => total + COLUMNS[k].min, 0);
  for (const drop of DROP_ORDER) {
    if (sum(keys) <= width) break;
    keys = keys.filter((k) => k !== drop);
  }

  const signature = keys.join(',');
  let layout = cache.get(signature);
  if (!layout) {
    const columns = keys.map((k) => COLUMNS[k]);
    layout = {
      columns,
      template: columns.map((c) => (c.grow ? `minmax(${c.min}px, ${c.grow}fr)` : `${c.min}px`)).join(' '),
      minWidth: sum(keys),
    };
    cache.set(signature, layout);
  }
  return layout;
}
