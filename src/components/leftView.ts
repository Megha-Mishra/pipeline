import { formatAgo } from '../domain/format';
import { firstName, type Deal } from '../domain/types';
import type { TabId } from '../view/query';

/**
 * Why a row no longer matches the view, and what happens next, as one message:
 * "Manish moved it to Contacted. Leaves this view on refresh", or without a name for the viewer's own change.
 * In views limited to the viewer's deals, a new owner is the likelier reason than a stage change.
 */
export function leftViewMessage(deal: Deal, me: string, tab: TabId): string {
  const by = deal.updatedBy === me ? null : firstName(deal.updatedBy);
  const ownViews = tab === 'today' || tab === 'mine';
  let what: string;
  if (ownViews && deal.owner !== me) {
    const owner = firstName(deal.owner);
    if (!by) what = `Reassigned to ${owner}`;
    else what = by === owner ? `${by} took it over` : `${by} reassigned it to ${owner}`;
  } else {
    what = by ? `${by} moved it to ${deal.stage}` : `Moved to ${deal.stage}`;
  }
  return `${what}. Leaves this view on refresh`;
}

/** The quiet line for a row with nothing going on: "Updated 2 days ago by you", "Updated yesterday by Ravi". */
export function updatedLine(deal: Deal, me: string, now: number): string {
  const when = formatAgo(deal.updatedAt, now);
  const who = deal.updatedBy === me ? 'you' : firstName(deal.updatedBy);
  return `Updated ${when.charAt(0).toLowerCase()}${when.slice(1)} by ${who}`;
}
