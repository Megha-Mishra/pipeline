import type { SortDir, SortKey } from '../view/query';

const SORT_WORDS: Record<SortKey, { name: string; asc: string; desc: string }> = {
  priority: { name: 'priority', asc: 'least urgent first', desc: 'most urgent first' },
  company: { name: 'deal name', asc: 'A to Z', desc: 'Z to A' },
  value: { name: 'value', asc: 'lowest first', desc: 'highest first' },
  stage: { name: 'stage', asc: 'earliest first', desc: 'latest first' },
  owner: { name: 'owner', asc: 'A to Z', desc: 'Z to A' },
  closeDate: { name: 'close date', asc: 'oldest first', desc: 'newest first' },
  lastActivity: { name: 'last activity', asc: 'oldest first', desc: 'most recent first' },
};

/** "Sorted by close date, oldest first." */
export function describeSort(key: SortKey, dir: SortDir): string {
  const words = SORT_WORDS[key];
  return `Sorted by ${words.name}, ${words[dir]}.`;
}
