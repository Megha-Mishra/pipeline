import { TEAM } from '../domain/seed';
import { STAGES, isOpenStage, stageIndex, type Deal, type DealChanges, type DealField, type Stage } from '../domain/types';

/** Knobs exposed in the Simulation panel. */
export interface SimConfig {
  failureRate: number;
  minDelayMs: number;
  maxDelayMs: number;
  teammateEditsPerMinute: number;
  offline: boolean;
}

export const DEFAULT_SIM_CONFIG: SimConfig = {
  failureRate: 0.1,
  minDelayMs: 300,
  maxDelayMs: 1500,
  teammateEditsPerMinute: 30,
  offline: false,
};

export type FailureKind = 'network' | 'offline';

export class SaveError extends Error {
  constructor(readonly kind: FailureKind) {
    super(kind === 'offline' ? 'You are offline' : 'Network error');
    this.name = 'SaveError';
  }
}

export interface UpdateRequest {
  /** Idempotency key: repeating a request ID never applies the change twice. */
  requestId: string;
  dealId: string;
  changes: DealChanges;
  /** The values the client believed each changed field had. A mismatch is a conflict. */
  expected: DealChanges;
}

export type UpdateResult =
  | { status: 'ok'; deal: Deal }
  | { status: 'conflict'; current: Deal; fields: DealField[] }
  | { status: 'missing' };

export type BulkItemResult = UpdateResult & { dealId: string; requestId: string };

export interface ServerEvent {
  deal: Deal;
  actor: string;
  fields: DealField[];
}

type Failure = 'network' | 'lost';

export interface ServerOptions {
  random?: () => number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  config?: Partial<SimConfig>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * In-memory stand-in for a backend. It is the source of truth: the UI only
 * ever sees deals through it, with latency, failures and teammates' edits.
 */
export class FakeServer {
  private readonly deals = new Map<string, Deal>();
  private readonly ids: string[];
  private readonly processed = new Map<string, UpdateResult>();
  private readonly listeners = new Set<(event: ServerEvent) => void>();
  private readonly heldEvents: ServerEvent[] = [];
  private readonly forced: Failure[] = [];
  private readonly random: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private config: SimConfig;
  private viewer = '';
  private hotIds: readonly string[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Number of network calls made, for tests and the simulation panel. */
  requestCount = 0;

  constructor(seed: Deal[], options: ServerOptions = {}) {
    for (const deal of seed) this.deals.set(deal.id, deal);
    this.ids = seed.map((d) => d.id);
    this.random = options.random ?? Math.random;
    this.sleep = options.sleep ?? realSleep;
    this.now = options.now ?? Date.now;
    this.config = { ...DEFAULT_SIM_CONFIG, ...options.config };
  }

  getConfig(): SimConfig {
    return this.config;
  }

  setConfig(patch: Partial<SimConfig>): void {
    const wasOffline = this.config.offline;
    this.config = { ...this.config, ...patch };
    if (wasOffline && !this.config.offline) {
      // Coming back online delivers everything teammates did meanwhile.
      this.heldEvents.splice(0).forEach((e) => this.listeners.forEach((l) => l(e)));
    }
  }

  /** Who is using this client, so simulated teammates are always someone else. */
  setViewer(name: string): void {
    this.viewer = name;
  }

  /** Deals the user can currently see; teammates favour them so changes are noticeable. */
  setHotIds(ids: readonly string[]): void {
    this.hotIds = ids;
  }

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Test hook: make the next request fail in a specific way. */
  failNext(kind: Failure): void {
    this.forced.push(kind);
  }

  peek(id: string): Deal | undefined {
    return this.deals.get(id);
  }

  async listDeals(): Promise<Deal[]> {
    await this.sleep(200);
    return Array.from(this.deals.values());
  }

  async update(request: UpdateRequest, actor: string): Promise<UpdateResult> {
    this.requestCount++;
    await this.sleep(this.latency());
    if (this.config.offline) throw new SaveError('offline');
    const failure = this.rollFailure();
    if (failure === 'network') throw new SaveError('network');
    const result = this.apply(request, actor);
    // The write landed but the response never reached the client.
    if (failure === 'lost') throw new SaveError('network');
    return result;
  }

  /** One round trip for many deals. A network failure fails the whole batch; nothing is applied. */
  async bulkUpdate(requests: UpdateRequest[], actor: string): Promise<BulkItemResult[]> {
    this.requestCount++;
    await this.sleep(this.latency());
    if (this.config.offline) throw new SaveError('offline');
    if (this.rollFailure()) throw new SaveError('network');
    return requests.map((r) => ({ ...this.apply(r, actor), dealId: r.dealId, requestId: r.requestId }));
  }

  startTeammates(): void {
    this.stopTeammates();
    this.scheduleTeammate();
  }

  stopTeammates(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** A simulated teammate edits a deal (a random one unless given). */
  teammateEdit(dealId?: string, changes?: DealChanges): Deal | null {
    const id = dealId ?? this.pickDealId();
    const deal = id ? this.deals.get(id) : undefined;
    if (!deal) return null;
    const others = TEAM.filter((name) => name !== this.viewer);
    const actor = others[Math.floor(this.random() * others.length)];
    let patch: DealChanges;
    if (changes) patch = changes;
    else if (dealId || this.random() < 0.75) patch = { stage: this.nextStage(deal.stage) };
    else patch = { owner: others.filter((n) => n !== deal.owner)[Math.floor(this.random() * (others.length - 1))] };

    const now = this.now();
    const next: Deal = {
      ...deal,
      ...patch,
      version: deal.version + 1,
      updatedAt: now,
      updatedBy: actor,
      lastActivityAt: now,
      lastRequestId: null,
    };
    this.deals.set(next.id, next);
    this.emit({ deal: next, actor, fields: Object.keys(patch) as DealField[] });
    return next;
  }

  private apply(request: UpdateRequest, actor: string): UpdateResult {
    const cached = this.processed.get(request.requestId);
    if (cached) return cached;
    const deal = this.deals.get(request.dealId);
    if (!deal) return { status: 'missing' };

    // Field-level optimistic concurrency: only the fields this request changes
    // must still hold the values the client saw. Other fields merge freely.
    const fields = Object.keys(request.changes) as DealField[];
    const clashing = fields.filter((f) => request.expected[f] !== undefined && deal[f] !== request.expected[f]);

    let result: UpdateResult;
    if (clashing.length > 0) {
      result = { status: 'conflict', current: deal, fields: clashing };
    } else {
      const now = this.now();
      const next: Deal = {
        ...deal,
        ...request.changes,
        version: deal.version + 1,
        updatedAt: now,
        updatedBy: actor,
        lastActivityAt: now,
        lastRequestId: request.requestId,
      };
      this.deals.set(next.id, next);
      result = { status: 'ok', deal: next };
    }
    this.processed.set(request.requestId, result);
    return result;
  }

  private latency(): number {
    const { minDelayMs, maxDelayMs } = this.config;
    return minDelayMs + this.random() * Math.max(0, maxDelayMs - minDelayMs);
  }

  private rollFailure(): Failure | null {
    const forced = this.forced.shift();
    if (forced) return forced;
    if (this.random() >= this.config.failureRate) return null;
    return this.random() < 0.3 ? 'lost' : 'network';
  }

  private emit(event: ServerEvent): void {
    if (this.config.offline) this.heldEvents.push(event);
    else this.listeners.forEach((l) => l(event));
  }

  private scheduleTeammate(): void {
    const rate = this.config.teammateEditsPerMinute;
    const wait = rate > 0 ? 60_000 / rate : 1000;
    this.timer = setTimeout(() => {
      if (this.config.teammateEditsPerMinute > 0) this.teammateEdit();
      this.scheduleTeammate();
    }, wait * (0.5 + this.random()));
  }

  private pickDealId(): string | undefined {
    if (this.hotIds.length > 0 && this.random() < 0.6) {
      return this.hotIds[Math.floor(this.random() * this.hotIds.length)];
    }
    return this.ids[Math.floor(this.random() * this.ids.length)];
  }

  private nextStage(stage: Stage): Stage {
    if (!isOpenStage(stage)) return 'Negotiation';
    const r = this.random();
    if (r < 0.12) return 'Lost';
    if (stage === 'Negotiation') return r < 0.7 ? 'Won' : 'Lost';
    return STAGES[stageIndex(stage) + 1];
  }
}
