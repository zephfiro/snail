export type WatchState = 'recording' | 'completed' | 'interrupted';
export type WatchSample =
  | { kind: 'measured'; timestamp: string; elapsedMs: number; cpuPercentOneCore: number; rssMiB: number }
  | { kind: 'gap'; timestamp: string; elapsedMs: number; reason: 'delayed' | 'unavailable' };

export interface WatchSession {
  schemaVersion: 1;
  id: string;
  startedAt: string;
  endedAt?: string;
  lastSavedAt: string;
  state: WatchState;
  /** Explicit ownership: only the VS Code Extension Host instance that started this session may write it. */
  instanceId: string;
  intervalMs: number;
  maxDurationMs: number;
  environment: {
    vscodeVersion: string;
    platform: string;
    remote: boolean;
    scope: 'current-node-extension-host';
  };
  samples: WatchSample[];
}
export const WATCH_INTERVAL_MS = 5000;
export const MAX_WATCH_DURATION_MS = 2 * 60 * 60 * 1000;
export const MAX_WATCH_SAMPLES = 1440;
export const MAX_WATCH_SESSIONS = 20;
export const WATCH_RETENTION_DAYS = 30;

export function isWatchSession(value: unknown): value is WatchSession {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<WatchSession>;
  return v.schemaVersion === 1 && typeof v.id === 'string' &&
    /^[a-f\d-]{36}$/.test(v.id) &&
    typeof v.startedAt === 'string' && Number.isFinite(Date.parse(v.startedAt)) &&
    typeof v.lastSavedAt === 'string' && Number.isFinite(Date.parse(v.lastSavedAt)) &&
    typeof v.instanceId === 'string' &&
    (v.state === 'recording' || v.state === 'completed' || v.state === 'interrupted') &&
    typeof v.intervalMs === 'number' && v.intervalMs >= 1000 && v.intervalMs <= 60000 &&
    typeof v.maxDurationMs === 'number' && v.maxDurationMs > 0 &&
    Boolean(v.environment) && v.environment?.scope === 'current-node-extension-host' &&
    Array.isArray(v.samples) && v.samples.length <= MAX_WATCH_SAMPLES &&
    v.samples.every(sample => sample && typeof sample === 'object' &&
      typeof sample.timestamp === 'string' && Number.isFinite(Date.parse(sample.timestamp)) &&
      ((sample.kind === 'measured' &&
        Number.isFinite(sample.elapsedMs) && sample.elapsedMs > 0 &&
        Number.isFinite(sample.cpuPercentOneCore) && sample.cpuPercentOneCore >= 0 &&
        Number.isFinite(sample.rssMiB) && sample.rssMiB >= 0) ||
       (sample.kind === 'gap' && (sample.reason === 'unavailable' || sample.reason === 'delayed'))));
}
