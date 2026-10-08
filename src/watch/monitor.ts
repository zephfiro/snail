import { randomUUID } from 'node:crypto';
import type { ProcessSampleSource } from '../measurements/process';
import { createWatchSampler, type WatchSampler } from './sampler';
import type { WatchSession, WatchSample } from './types';
import { WATCH_INTERVAL_MS, MAX_WATCH_DURATION_MS, MAX_WATCH_SAMPLES } from './types';
import type { WatchStorage } from './storage';

export interface WatchClock {
  nowMs(): number;
  /** Returns a disposable timer. No polling occurs when the monitor is off. */
  schedule(ms: number, callback: () => void): () => void;
}

export interface WatchEnvironment extends WatchSession['environment'] {}
type WatchStatus = (session: WatchSession | undefined) => void;
export interface WatchMonitorConfig {
  store: WatchStorage;
  processSource(): ProcessSampleSource;
  environment: WatchEnvironment;
  clock?: WatchClock;
  onStatus?: WatchStatus;
  onError?: (message: string) => void;
}

const DEFAULT_CLOCK: WatchClock = {
  nowMs: () => Date.now(),
  schedule: (ms, callback) => {
    const timer = setTimeout(callback, ms);
    return () => clearTimeout(timer);
  }
};

export class WatchMonitor {
  private session?: WatchSession;
  private sampler?: WatchSampler;
  private cancelTimer?: () => void;
  private pendingWrite: Promise<void> = Promise.resolve();
  private readonly clock: WatchClock;
  private readonly instanceId = randomUUID();
  private ending?: Promise<WatchSession | undefined>;

  constructor(private readonly config: WatchMonitorConfig) {
    this.clock = config.clock ?? DEFAULT_CLOCK;
  }
  get active(): boolean { return this.session?.state === 'recording'; }
  get current(): WatchSession | undefined { return this.session; }

  async start(durationMs = MAX_WATCH_DURATION_MS): Promise<WatchSession> {
    if (this.active || this.ending) throw new Error('Snail Watch is already active or stopping');
    if (!Number.isSafeInteger(durationMs) || durationMs < WATCH_INTERVAL_MS ||
        durationMs > MAX_WATCH_DURATION_MS) throw new Error('Invalid Watch duration');
    const sampler = createWatchSampler(this.config.processSource(), WATCH_INTERVAL_MS);
    const timestamp = new Date(this.clock.nowMs()).toISOString();
    const session: WatchSession = {
      schemaVersion:1,id:randomUUID(),instanceId:this.instanceId,
      state:'recording',startedAt:timestamp,lastSavedAt:timestamp,
      intervalMs:WATCH_INTERVAL_MS,maxDurationMs:durationMs,
      environment:{...this.config.environment},samples:[]
    };
    // Explicit start must be durable before any timers are scheduled.
    await this.config.store.save(session);
    this.session = session;
    this.sampler = sampler;
    this.config.onStatus?.(session);
    this.scheduleNext();
    return session;
  }

  private scheduleNext():void {
    if (!this.active) return;
    this.cancelTimer?.();
    this.cancelTimer = this.clock.schedule(WATCH_INTERVAL_MS, () => {
      void this.tick();
    });
  }

  private async tick(): Promise<void> {
    const session = this.session;
    if (!session || session.state !== 'recording' || !this.sampler) return;
    const now = this.clock.nowMs();
    const elapsed = now-Date.parse(session.startedAt);
    let sample: WatchSample;
    try { sample = this.sampler.capture(new Date(now).toISOString()); }
    catch { sample={kind:'gap',timestamp:new Date(now).toISOString(),elapsedMs:0,reason:'unavailable'}; }
    // An earlier Stop may have completed; never publish a late sample.
    if (this.session !== session || session.state !== 'recording') return;
    session.samples.push(sample);
    session.lastSavedAt = new Date(now).toISOString();
    this.config.onStatus?.(session);

    if (session.samples.length >= MAX_WATCH_SAMPLES || elapsed >= session.maxDurationMs) {
      // Do not await Stop from inside a scheduled callback; it may need to drain a write.
      void this.stop().catch(() => this.config.onError?.('Unable to save the final Watch session.'));
      return;
    }
    if (session.samples.length % 6 === 0) {
      void this.writeSnapshot(session).catch(() => {
        this.config.onError?.('Watch storage unavailable; monitor stopped to avoid losing data.');
        void this.stop().catch(() => undefined);
      });
    }
    this.scheduleNext();
  }

  private writeSnapshot(session: WatchSession): Promise<void> {
    // Snapshot before queuing to prevent a later tick mutating an in-flight write.
    const copy: WatchSession = {...session,samples:session.samples.map(sample=>({...sample}))};
    const next = this.pendingWrite.catch(() => undefined).then(() => this.config.store.save(copy));
    this.pendingWrite = next;
    return next;
  }

  async stop(): Promise<WatchSession | undefined> {
    if (this.ending) return this.ending;
    const session = this.session;
    if (!session || session.state !== 'recording') return session;
    session.state = 'completed';
    session.endedAt = new Date(this.clock.nowMs()).toISOString();
    session.lastSavedAt = session.endedAt;
    this.cancelTimer?.();
    this.cancelTimer = undefined;
    this.sampler = undefined;
    this.config.onStatus?.(undefined);
    this.ending = (async()=>{
      try {
        await this.writeSnapshot(session);
        await this.config.store.prune();
        return session;
      } finally {
        this.session=undefined;
        this.ending=undefined;
      }
    })();
    return this.ending;
  }

  /** VS Code calls deactivate on normal unload; no attempt to restart on activation. */
  dispose(): void {
    this.cancelTimer?.();
    this.cancelTimer=undefined;
    if(this.active)void this.stop().catch(()=>undefined);
  }
}
