const DAY = 86_400_000;

/** A timestamp as the "yyyy-mm-dd" value a date input expects, in local time; empty for null. */
export function toDateInput(ts: number | null): string {
  if (ts === null) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * A date input's value as a timestamp: the start of that local day, or its last millisecond
 * when `endOfDay` is set, so a "to" date includes deals closing on that day. Empty or invalid gives null.
 */
export function fromDateInput(value: string, endOfDay = false): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const start = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime();
  if (Number.isNaN(start)) return null;
  return endOfDay ? start + DAY - 1 : start;
}
