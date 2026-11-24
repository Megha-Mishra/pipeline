import { dayDiff } from './dates';
import { plural } from './format';
import { firstName, isOpenStage, type Deal, type Stage } from './types';

export type PriorityTone = 'urgent' | 'soon' | 'stale' | 'fresh';

export interface Priority {
  score: number;
  reason: string;
  tone: PriorityTone;
}

// Silence hurts most late in the funnel.
const STALE_STAGES: readonly Stage[] = ['Proposal Sent', 'Negotiation'];
const STALE_AFTER_DAYS = 21;
/** Close dates further back than this are clean-up work, not today's work. */
const OVERDUE_WINDOW_DAYS = 7;

/**
 * Decides whether an open deal needs attention today and why.
 * Returns the strongest reason; deal value only breaks ties between similar reasons.
 */
export function prioritize(deal: Deal, now: number, me: string): Priority | null {
  if (!isOpenStage(deal.stage)) return null;
  const reasons: Priority[] = [];

  const closeIn = dayDiff(deal.closeDate, now);
  if (closeIn === 0) {
    reasons.push({ score: 100, reason: 'Close date today', tone: 'urgent' });
  } else if (closeIn < 0 && closeIn >= -OVERDUE_WINDOW_DAYS) {
    reasons.push({ score: 90, reason: `Close date passed ${plural(-closeIn, 'day')} ago`, tone: 'urgent' });
  } else if (closeIn > 0 && closeIn <= 7) {
    reasons.push({ score: 60 - closeIn, reason: `Closes in ${plural(closeIn, 'day')}`, tone: 'soon' });
  }

  if (deal.nextFollowUpAt !== null) {
    const due = dayDiff(deal.nextFollowUpAt, now);
    if (due < 0) {
      reasons.push({ score: 80 + Math.min(-due, 10), reason: `Follow-up ${plural(-due, 'day')} late`, tone: 'urgent' });
    } else if (due === 0) {
      reasons.push({ score: 70, reason: 'Follow-up due today', tone: 'soon' });
    }
  }

  if (dayDiff(deal.updatedAt, now) === 0 && deal.updatedBy !== me) {
    reasons.push({ score: 50, reason: `Changed today by ${firstName(deal.updatedBy)}`, tone: 'fresh' });
  }

  const idle = dayDiff(now, deal.lastActivityAt);
  if (STALE_STAGES.includes(deal.stage) && idle >= STALE_AFTER_DAYS) {
    reasons.push({ score: 40, reason: `No activity in ${plural(idle, 'day')}`, tone: 'stale' });
  }

  if (reasons.length === 0) return null;
  const best = reasons.reduce((a, b) => (b.score > a.score ? b : a));
  return { ...best, score: best.score + Math.log10(Math.max(deal.value, 1)) };
}
