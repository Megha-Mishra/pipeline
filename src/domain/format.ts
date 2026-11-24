import { dayDiff } from './dates';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export const formatINR = (value: number): string => inr.format(value);
export const formatCount = (n: number): string => n.toLocaleString('en-IN');
export const formatDate = (ts: number): string => dateFmt.format(ts);
export const plural = (n: number, word: string): string => `${formatCount(n)} ${word}${n === 1 ? '' : 's'}`;

export function formatRelativeDay(ts: number, now: number): string {
  const d = dayDiff(ts, now);
  if (d === 0) return 'Today';
  if (d === -1) return 'Yesterday';
  if (d === 1) return 'Tomorrow';
  return d < 0 ? `${plural(-d, 'day')} ago` : `In ${plural(d, 'day')}`;
}

/** "Just now", "11m ago", "3h ago" within the last day; otherwise the same as formatRelativeDay. */
export function formatAgo(ts: number, now: number): string {
  const minutes = Math.floor((now - ts) / 60_000);
  if (minutes < 0) return formatRelativeDay(ts, now);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60 && dayDiff(ts, now) === 0) return `${Math.floor(minutes / 60)}h ago`;
  return formatRelativeDay(ts, now);
}
