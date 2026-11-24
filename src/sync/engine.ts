import { FakeServer, SaveError, type FailureKind, type SimConfig, type UpdateResult } from '../api/fakeServer';
import { formatCount } from '../domain/format';
import { firstName, type Deal, type Stage } from '../domain/types';

/** Per-deal save state shown in the Status column. */
export type RowStatus =
  | { kind: 'saving'; target: Stage }
  | { kind: 'queued'; target: Stage }
  | { kind: 'failed'; target: Stage; error: FailureKind; requestId: string; expected: Stage }
  | { kind: 'conflict'; mine: Stage; theirs: Stage; by: string };

export interface DisplayRow {
  /** The deal as the user should see it: server data plus their pending move. */
  deal: Deal;
  status: RowStatus | null;
}

export interface UndoItem {
  id: string;
  from: Stage;
  to: Stage;
}

export interface UndoEntry {
  kind: 'single' | 'bulk';
  label: string;
  items: UndoItem[];
  jobId?: string;
}

export interface BulkJob {
  id: string;
  label: string;
  total: number;
  processed: number;
  succeeded: UndoItem[];
  failed: Array<{ id: string; to: Stage }>;
  conflicts: Array<{ id: string; mine: Stage; theirs: Stage; by: string }>;
  /** Already in the target stage when the server got to them. */
  unchanged: number;
  notAttempted: number;
  status: 'running' | 'cancelled' | 'done';
  isUndo: boolean;
  startedAt: number;
  finishedAt: number | null;
}

export type ToastAction = { label: string; kind: 'retry-failed' } | { label: string; kind: 'resolve'; id: string };

export interface Toast {
  id: string;
  key?: string;
  tone: 'error' | 'conflict' | 'info';
  message: string;
  action?: ToastAction;
}

interface DealSync {
  inflight: { requestId: string; target: Stage } | null;
  /** The user's latest intent while a save is in flight. Only the newest is kept. */
  queued: { target: Stage; expected?: Stage } | null;
  status: RowStatus | null;
  /** Requests this client sent, to recognise our own write when its response was lost. */
  ownRequestIds: Set<string>;
}

interface BulkItem {
  id: string;
  to: Stage;
  /** Undo passes the stage it expects to find; otherwise the current stage is used. */
  expected?: Stage;
}

export const BULK_THRESHOLD = 25;
export const CHUNK_SIZE = 200;
export const BULK_CONCURRENCY = 3;
const UNDO_LIMIT = 30;
const MAX_TOASTS = 4;

/**
 * Client-side state and save logic, independent of React.
 * React reads it through subscribe/getVersion (useSyncExternalStore).
 */
export class PipelineEngine {
  readonly deals = new Map<string, Deal>();
  undoStack: UndoEntry[] = [];
  bulk: BulkJob | null = null;
  toasts: Toast[] = [];
  loaded = false;
  me: string;

  private readonly sync = new Map<string, DealSync>();
  private readonly displayCache = new Map<string, { deal: Deal; status: RowStatus | null; row: DisplayRow }>();
  private readonly teammateFlashes = new Map<string, number>();
  private readonly savedFlashes = new Map<string, number>();
  private readonly listeners = new Set<() => void>();
  private readonly changeListeners = new Set<(ids: string[]) => void>();
  private failedCache: string[] | null = null;
  private bulkCancelRequested = false;
  private version = 0;
  private emitScheduled = false;
  private seq = 0;
  private unsubscribeServer: (() => void) | null = null;

  constructor(
    readonly server: FakeServer,
    me: string,
    private readonly now: () => number = Date.now,
  ) {
    this.me = me;
    server.setViewer(me);
  }

  async load(): Promise<void> {
    const deals = await this.server.listDeals();
    for (const deal of deals) this.deals.set(deal.id, deal);
    this.unsubscribeServer = this.server.subscribe((e) => this.receive(e.deal, e.actor));
    this.loaded = true;
    this.emit();
  }

  dispose(): void {
    this.unsubscribeServer?.();
  }

  // ---- React bindings -------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getVersion = (): number => this.version;

  /** Notified with deal IDs whose data changed (teammates' edits and our own moves). */
  onDealsChanged(listener: (ids: string[]) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  // ---- Reading ----------------------------------------------------------

  getRow(id: string): DisplayRow | undefined {
    const deal = this.deals.get(id);
    if (!deal) return undefined;
    const status = this.sync.get(id)?.status ?? null;
    const cached = this.displayCache.get(id);
    if (cached && cached.deal === deal && cached.status === status) return cached.row;
    const shown = status?.kind === 'saving' && status.target !== deal.stage ? { ...deal, stage: status.target } : deal;
    const row: DisplayRow = { deal: shown, status };
    this.displayCache.set(id, { deal, status, row });
    return row;
  }

  /** Visits every deal as displayed. Fast path for deals with no pending save. */
  forEachDisplayDeal(callback: (deal: Deal) => void): void {
    for (const [id, deal] of this.deals) {
      const status = this.sync.get(id)?.status;
      callback(status?.kind === 'saving' ? this.getRow(id)!.deal : deal);
    }
  }

  teammateFlashAt(id: string): number | undefined {
    return this.teammateFlashes.get(id);
  }

  savedFlashAt(id: string): number | undefined {
    return this.savedFlashes.get(id);
  }

  get failedIds(): string[] {
    if (!this.failedCache) {
      this.failedCache = [];
      for (const [id, s] of this.sync) if (s.status?.kind === 'failed') this.failedCache.push(id);
    }
    return this.failedCache;
  }

  getConfig(): SimConfig {
    return this.server.getConfig();
  }

  setSimConfig(patch: Partial<SimConfig>): void {
    this.server.setConfig(patch);
    this.emit();
  }

  setMe(name: string): void {
    this.me = name;
    this.server.setViewer(name);
    this.emit();
  }

  // ---- Moving deals -----------------------------------------------------

  /** Moves deals to a stage. Small sets save one by one; large sets run as a bulk job. */
  move(ids: string[], target: Stage, label?: string): void {
    const items: UndoItem[] = [];
    for (const id of ids) {
      const row = this.getRow(id);
      if (row && row.deal.stage !== target) items.push({ id, from: row.deal.stage, to: target });
    }
    if (items.length === 0) return;

    if (items.length > BULK_THRESHOLD) {
      this.startBulk(items.map((i) => ({ id: i.id, to: target })), label ?? `Move ${formatCount(items.length)} deals to ${target}`);
      return;
    }
    for (const item of items) this.requestMove(item.id, target);
    const name = items.length === 1 ? this.deals.get(items[0].id)!.company : `${items.length} deals`;
    this.pushUndo({ kind: 'single', label: label ?? `Move ${name} to ${target}`, items });
    this.notifyChanged(items.map((i) => i.id));
    this.emit();
  }

  retry(id: string): void {
    const status = this.sync.get(id)?.status;
    if (status?.kind !== 'failed') return;
    // Same request ID: if the first attempt actually landed, the server returns
    // that result instead of applying the change again.
    this.dispatch(id, { requestId: status.requestId, target: status.target, expected: status.expected });
    this.refreshFailureToast();
  }

  retryAllFailed(): void {
    const ids = [...this.failedIds];
    if (ids.length > BULK_THRESHOLD && this.bulk?.status !== 'running') {
      const items = ids.map((id) => {
        const s = this.sync.get(id)!.status as Extract<RowStatus, { kind: 'failed' }>;
        return { id, to: s.target };
      });
      this.startBulk(items, `Retry ${formatCount(items.length)} failed moves`);
      return;
    }
    ids.forEach((id) => this.retry(id));
  }

  dismissFailure(id: string): void {
    if (this.sync.get(id)?.status?.kind !== 'failed') return;
    this.setStatus(id, null);
    this.refreshFailureToast();
  }

  resolveConflict(id: string, choice: 'mine' | 'theirs'): void {
    const status = this.sync.get(id)?.status;
    if (status?.kind !== 'conflict') return;
    this.removeToast(`conflict-${id}`);
    if (choice === 'theirs') this.setStatus(id, null);
    else this.send(id, status.mine);
  }

  undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) {
      this.pushToast({ tone: 'info', message: 'Nothing to undo.' });
      return;
    }
    if (entry.kind === 'bulk' || entry.items.length > BULK_THRESHOLD) {
      this.startUndoBulk(entry);
      return;
    }
    // Undo is a new save that expects the stage we moved to. If a teammate has
    // changed the deal since, it comes back as a conflict instead of overwriting them.
    for (const item of entry.items) this.requestMove(item.id, item.from, item.to);
    this.notifyChanged(entry.items.map((i) => i.id));
    this.pushToast({ tone: 'info', message: `Undone: ${entry.label}.` });
    this.emit();
  }

  undoBulk(jobId: string): void {
    const index = this.undoStack.findIndex((e) => e.jobId === jobId);
    if (index < 0) return;
    const [entry] = this.undoStack.splice(index, 1);
    this.startUndoBulk(entry);
  }

  // ---- Bulk jobs --------------------------------------------------------

  startBulk(items: BulkItem[], label: string, isUndo = false): BulkJob | null {
    if (this.bulk?.status === 'running') {
      this.pushToast({ tone: 'info', message: 'A bulk move is already running. Wait for it to finish.' });
      return null;
    }
    const plan = items.filter((item) => {
      const deal = this.deals.get(item.id);
      return deal !== undefined && deal.stage !== item.to && !this.sync.get(item.id)?.inflight;
    });
    const job: BulkJob = {
      id: this.newId('job'),
      label,
      total: plan.length,
      processed: 0,
      succeeded: [],
      failed: [],
      conflicts: [],
      unchanged: 0,
      notAttempted: 0,
      status: 'running',
      isUndo,
      startedAt: this.now(),
      finishedAt: null,
    };
    this.bulk = job;
    this.bulkCancelRequested = false;
    for (const item of plan) this.setStatusQuiet(item.id, { kind: 'queued', target: item.to });
    this.refreshFailureToast();
    this.emit();
    void this.runBulk(job, plan);
    return job;
  }

  cancelBulk(): void {
    if (this.bulk?.status !== 'running') return;
    this.bulkCancelRequested = true;
    this.emit();
  }

  retryBulkFailed(): void {
    const job = this.bulk;
    if (!job || job.status === 'running') return;
    const items = job.failed
      .filter((f) => this.sync.get(f.id)?.status?.kind === 'failed')
      .map((f) => ({ id: f.id, to: f.to }));
    if (items.length) this.startBulk(items, `Retry ${formatCount(items.length)} failed moves`);
  }

  dismissBulk(): void {
    if (this.bulk?.status === 'running') return;
    this.bulk = null;
    this.emit();
  }

  get bulkCancelling(): boolean {
    return this.bulkCancelRequested;
  }

  // ---- Toasts -----------------------------------------------------------

  dismissToast(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.emit();
  }

  // ---- Incoming data ----------------------------------------------------

  /** Applies a deal pushed by the server (a teammate's change). */
  receive(deal: Deal, actor: string): void {
    if (!this.upsert(deal)) return;
    if (actor !== this.me) this.teammateFlashes.set(deal.id, this.now());
    const status = this.sync.get(deal.id)?.status;
    if (status?.kind === 'conflict') {
      this.setStatusQuiet(deal.id, { ...status, theirs: deal.stage, by: actor });
    }
    this.notifyChanged([deal.id]);
    this.emit();
  }

  // ---- Internals --------------------------------------------------------

  private requestMove(id: string, target: Stage, expected?: Stage): void {
    const s = this.ensureSync(id);
    if (s.inflight) {
      // One save per deal at a time. Rapid changes collapse into the latest intent.
      s.queued = { target, expected };
      this.setStatusQuiet(id, { kind: 'saving', target });
      return;
    }
    this.send(id, target, expected);
  }

  private send(id: string, target: Stage, expected?: Stage): void {
    const deal = this.deals.get(id);
    if (!deal) return;
    if (deal.stage === target) {
      this.setStatus(id, null);
      this.refreshFailureToast();
      return;
    }
    this.dispatch(id, { requestId: this.newId('req'), target, expected: expected ?? deal.stage });
  }

  private dispatch(id: string, request: { requestId: string; target: Stage; expected: Stage }): void {
    const s = this.ensureSync(id);
    s.inflight = { requestId: request.requestId, target: request.target };
    s.ownRequestIds.add(request.requestId);
    this.setStatus(id, { kind: 'saving', target: request.target });
    this.server
      .update(
        { requestId: request.requestId, dealId: id, changes: { stage: request.target }, expected: { stage: request.expected } },
        this.me,
      )
      .then(
        (result) => this.onSaveResult(id, request.requestId, request.target, result),
        (error: unknown) => this.onSaveError(id, request, error),
      );
  }

  private onSaveResult(id: string, requestId: string, target: Stage, result: UpdateResult): void {
    const s = this.sync.get(id);
    if (!s) return;
    if (result.status === 'ok') this.upsert(result.deal);
    if (result.status === 'conflict') this.upsert(result.current);
    if (s.inflight?.requestId !== requestId) {
      this.emit();
      return;
    }
    s.inflight = null;

    if (result.status === 'ok') {
      if (s.queued) this.sendQueued(id, s);
      else {
        this.savedFlashes.set(id, this.now());
        this.setStatus(id, null);
      }
      this.notifyChanged([id]);
      return;
    }

    if (result.status === 'conflict') {
      const mine = s.queued?.target ?? target;
      s.queued = null;
      const current = result.current;
      const ourEarlierWrite = current.lastRequestId !== null && s.ownRequestIds.has(current.lastRequestId);
      if (ourEarlierWrite || current.stage === mine) {
        // Not a real conflict: our own earlier write landed (its response was
        // lost) or the teammate made the same change. Rebase and continue.
        this.send(id, mine);
        return;
      }
      this.setStatus(id, { kind: 'conflict', mine, theirs: current.stage, by: current.updatedBy });
      this.pushToast({
        key: `conflict-${id}`,
        tone: 'conflict',
        message: `${current.company}: ${firstName(current.updatedBy)} moved it to ${current.stage} first, so your move to ${mine} wasn't applied.`,
        action: { label: 'Review', kind: 'resolve', id },
      });
      return;
    }

    this.setStatus(id, null);
  }

  private onSaveError(id: string, request: { requestId: string; target: Stage; expected: Stage }, error: unknown): void {
    const s = this.sync.get(id);
    if (!s || s.inflight?.requestId !== request.requestId) return;
    s.inflight = null;
    if (s.queued) {
      // A newer intent supersedes the failed one.
      this.sendQueued(id, s);
      return;
    }
    const kind: FailureKind = error instanceof SaveError ? error.kind : 'network';
    this.setStatus(id, { kind: 'failed', target: request.target, error: kind, requestId: request.requestId, expected: request.expected });
    this.refreshFailureToast();
  }

  private sendQueued(id: string, s: DealSync): void {
    const queued = s.queued!;
    s.queued = null;
    this.send(id, queued.target, queued.expected);
  }

  private startUndoBulk(entry: UndoEntry): void {
    const job = this.startBulk(
      entry.items.map((i) => ({ id: i.id, to: i.from, expected: i.to })),
      `Undo: ${entry.label}`,
      true,
    );
    if (!job) this.undoStack.push(entry);
  }

  private async runBulk(job: BulkJob, plan: BulkItem[]): Promise<void> {
    const chunks: BulkItem[][] = [];
    for (let i = 0; i < plan.length; i += CHUNK_SIZE) chunks.push(plan.slice(i, i + CHUNK_SIZE));
    let next = 0;
    const worker = async () => {
      while (next < chunks.length && !this.bulkCancelRequested) {
        const chunk = chunks[next++];
        await this.runChunk(job, chunk);
      }
    };
    await Promise.all(Array.from({ length: Math.min(BULK_CONCURRENCY, chunks.length) }, worker));

    const skipped = chunks.slice(next).flat();
    for (const item of skipped) this.setStatusQuiet(item.id, null);
    job.notAttempted = skipped.length;
    job.status = this.bulkCancelRequested ? 'cancelled' : 'done';
    job.finishedAt = this.now();
    this.bulkCancelRequested = false;
    if (!job.isUndo && job.succeeded.length > 0) {
      this.pushUndo({ kind: 'bulk', label: job.label, items: job.succeeded, jobId: job.id });
    }
    this.emit();
  }

  private async runChunk(job: BulkJob, chunk: BulkItem[]): Promise<void> {
    const requests = chunk.map((item) => {
      const deal = this.deals.get(item.id)!;
      return {
        from: deal.stage,
        to: item.to,
        request: { requestId: this.newId('req'), dealId: item.id, changes: { stage: item.to }, expected: { stage: item.expected ?? deal.stage } },
      };
    });
    const changed: string[] = [];
    try {
      const results = await this.server.bulkUpdate(requests.map((r) => r.request), this.me);
      results.forEach((result, i) => {
        const { from, to } = requests[i];
        const id = result.dealId;
        if (result.status === 'ok') {
          this.upsert(result.deal);
          job.succeeded.push({ id, from, to });
          this.setStatusQuiet(id, null);
          changed.push(id);
        } else if (result.status === 'conflict') {
          this.upsert(result.current);
          if (result.current.stage === to) {
            job.unchanged++;
            this.setStatusQuiet(id, null);
          } else {
            const conflict = { mine: to, theirs: result.current.stage, by: result.current.updatedBy };
            job.conflicts.push({ id, ...conflict });
            this.setStatusQuiet(id, { kind: 'conflict', ...conflict });
          }
        } else {
          job.unchanged++;
          this.setStatusQuiet(id, null);
        }
      });
    } catch (error) {
      const kind: FailureKind = error instanceof SaveError ? error.kind : 'network';
      for (const r of requests) {
        job.failed.push({ id: r.request.dealId, to: r.to });
        this.setStatusQuiet(r.request.dealId, {
          kind: 'failed',
          target: r.to,
          error: kind,
          requestId: r.request.requestId,
          expected: r.request.expected.stage,
        });
      }
    } finally {
      job.processed += chunk.length;
      if (changed.length) this.notifyChanged(changed);
      this.emit();
    }
  }

  /** Version-gated: an older copy of a deal never replaces a newer one. */
  private upsert(deal: Deal): boolean {
    const current = this.deals.get(deal.id);
    if (current && current.version >= deal.version) return false;
    this.deals.set(deal.id, deal);
    return true;
  }

  private ensureSync(id: string): DealSync {
    let s = this.sync.get(id);
    if (!s) {
      s = { inflight: null, queued: null, status: null, ownRequestIds: new Set() };
      this.sync.set(id, s);
    }
    return s;
  }

  private setStatusQuiet(id: string, status: RowStatus | null): void {
    this.ensureSync(id).status = status;
    this.failedCache = null;
  }

  private setStatus(id: string, status: RowStatus | null): void {
    this.setStatusQuiet(id, status);
    this.emit();
  }

  private refreshFailureToast(): void {
    // Bulk failures are reported in the bulk panel, not as a toast.
    const bulkFailed = new Set(this.bulk?.failed.map((f) => f.id));
    const failed = this.failedIds.filter((id) => !bulkFailed.has(id));
    if (failed.length === 0) {
      this.removeToast('failures');
      return;
    }
    const offline = this.getConfig().offline;
    const reason = offline ? "You're offline. Retry once you're back online." : 'The network request failed. Retry, or press Shift+R.';
    let message: string;
    if (failed.length === 1) {
      const s = this.sync.get(failed[0])!.status as Extract<RowStatus, { kind: 'failed' }>;
      message = `${this.deals.get(failed[0])!.company} wasn't moved to ${s.target}. ${reason}`;
    } else {
      message = `${formatCount(failed.length)} moves didn't save. ${reason}`;
    }
    this.pushToast({
      key: 'failures',
      tone: 'error',
      message,
      action: { label: failed.length === 1 ? 'Retry' : 'Retry all', kind: 'retry-failed' },
    });
  }

  private pushToast(toast: Omit<Toast, 'id'>): void {
    const existing = toast.key ? this.toasts.find((t) => t.key === toast.key) : undefined;
    const next: Toast = { ...toast, id: existing?.id ?? this.newId('toast') };
    this.toasts = existing ? this.toasts.map((t) => (t === existing ? next : t)) : [...this.toasts, next].slice(-MAX_TOASTS);
    this.emit();
  }

  private removeToast(key: string): void {
    if (!this.toasts.some((t) => t.key === key)) return;
    this.toasts = this.toasts.filter((t) => t.key !== key);
    this.emit();
  }

  private pushUndo(entry: UndoEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > UNDO_LIMIT) this.undoStack.shift();
  }

  private notifyChanged(ids: string[]): void {
    this.changeListeners.forEach((l) => l(ids));
  }

  private newId(prefix: string): string {
    return `${prefix}-${++this.seq}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Batches many state changes into one React update. */
  private emit(): void {
    if (this.emitScheduled) return;
    this.emitScheduled = true;
    queueMicrotask(() => {
      this.emitScheduled = false;
      this.version++;
      this.listeners.forEach((l) => l());
    });
  }
}
