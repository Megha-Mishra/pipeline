export const STAGES = [
  'New Lead',
  'Contacted',
  'Demo Done',
  'Proposal Sent',
  'Negotiation',
  'Won',
  'Lost',
] as const;

export type Stage = (typeof STAGES)[number];

export const stageIndex = (stage: Stage): number => STAGES.indexOf(stage);
export const isOpenStage = (stage: Stage): boolean => stage !== 'Won' && stage !== 'Lost';

export interface Deal {
  id: string;
  company: string;
  city: string;
  licences: number;
  /** Deal value in rupees. */
  value: number;
  stage: Stage;
  owner: string;
  /** Start-of-day timestamps (ms). */
  closeDate: number;
  nextFollowUpAt: number | null;
  lastActivityAt: number;
  updatedAt: number;
  updatedBy: string;
  /** Incremented by the server on every write. Used to drop stale data. */
  version: number;
  /** The request that produced this version, so a client can recognise its own write. */
  lastRequestId: string | null;
}

export type DealField = 'stage' | 'owner';
export type DealChanges = Partial<Pick<Deal, DealField>>;

export const firstName = (fullName: string): string => fullName.split(' ')[0] ?? fullName;
