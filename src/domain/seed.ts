import { DAY, startOfDay } from './dates';
import { isOpenStage, type Deal, type Stage } from './types';

export const TEAM = [
  'Priya Sharma', 'Ravi Kumar', 'Anil Mehta', 'Meera Iyer', 'Arjun Nair',
  'Sneha Patel', 'Vikram Singh', 'Kavya Reddy', 'Rohan Gupta', 'Ananya Das',
  'Karan Malhotra', 'Isha Verma', 'Siddharth Rao', 'Pooja Joshi', 'Aditya Kulkarni',
  'Neha Kapoor', 'Rahul Bose', 'Divya Menon', 'Manish Agarwal', 'Tara Pillai',
] as const;

export const DEFAULT_ME: string = TEAM[0];

const PREFIXES = ['Acme', 'Northwind', 'Zenith', 'Kaveri', 'Bluepeak', 'Indus', 'Saffron', 'Meridian', 'Orbit', 'Lotus',
  'Harbor', 'Crescent', 'Delta', 'Granite', 'Silverline', 'Tulip', 'Apex', 'Monsoon', 'Riverbend', 'Everest',
  'Nimbus', 'Cobalt', 'Banyan', 'Peacock', 'Quartz', 'Horizon', 'Vertex', 'Coral', 'Summit', 'Ganga',
  'Pinnacle', 'Aurora', 'Falcon', 'Jade', 'Maple', 'Onyx', 'Prism', 'Sterling', 'Tidal', 'Unity'];
const SUFFIXES = ['Corp', 'Logistics', 'Health', 'Textiles', 'Analytics', 'Freight', 'Retail', 'Education', 'Fintech',
  'Pharma', 'Systems', 'Foods', 'Motors', 'Works', 'Hotels', 'Interiors', 'Couriers', 'Media', 'Clinics', 'Labs',
  'Energy', 'Telecom', 'Realty', 'Steel', 'Agro', 'Software', 'Capital', 'Studios'];
const CITIES = ['Mumbai', 'Delhi', 'Bengaluru', 'Pune', 'Hyderabad', 'Chennai', 'Kolkata', 'Ahmedabad', 'Jaipur',
  'Lucknow', 'Kochi', 'Indore', 'Chandigarh', 'Nagpur', 'Surat'];

/** Roughly how a mature pipeline is spread across stages. */
const STAGE_WEIGHTS: Array<[Stage, number]> = [
  ['New Lead', 9800], ['Contacted', 10200], ['Demo Done', 8100], ['Proposal Sent', 6900],
  ['Negotiation', 3600], ['Won', 4700], ['Lost', 6700],
];

/** Small deterministic PRNG so every reviewer sees the same data. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDeals(count = 50_000, now = Date.now(), seed = 42): Deal[] {
  const rand = mulberry32(seed);
  const int = (min: number, max: number) => min + Math.floor(rand() * (max - min + 1));
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
  const totalWeight = STAGE_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);
  const pickStage = (): Stage => {
    let r = rand() * totalWeight;
    for (const [stage, w] of STAGE_WEIGHTS) {
      if ((r -= w) < 0) return stage;
    }
    return 'New Lead';
  };

  const today = startOfDay(now);
  const deals: Deal[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const stage = pickStage();
    const open = isOpenStage(stage);
    const owner = pick(TEAM);
    const licences = int(5, 400);
    const value = Math.max(25_000, Math.round((licences * int(4, 30) * 500) / 1000) * 1000);
    const lastActivityAt = Math.min(now, today - Math.floor(rand() ** 3 * 45) * DAY + int(9, 18) * 3_600_000);
    deals[i] = {
      id: `D-${String(i + 1).padStart(5, '0')}`,
      company: `${pick(PREFIXES)} ${pick(SUFFIXES)}`,
      city: pick(CITIES),
      licences,
      value,
      stage,
      owner,
      closeDate: open ? today + int(-200, 90) * DAY : today - int(1, 365) * DAY,
      nextFollowUpAt: open && rand() < 0.35 ? today + int(-4, 30) * DAY : null,
      lastActivityAt,
      updatedAt: lastActivityAt,
      updatedBy: owner,
      version: 1,
      lastRequestId: null,
    };
  }
  return deals;
}
