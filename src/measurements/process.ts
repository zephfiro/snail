import { CollectionUnavailable, type ProcessEvidence } from '../core/contracts';

/** Deliberately narrow: the source can be replaced with deterministic test counters. */
export interface ProcessSampleSource {
  nowNs(): bigint;
  cpuUsage(previous?: { user: number; system: number }): { user: number; system: number };
  rssBytes(): number;
  sleep(ms: number): Promise<void>;
}

const SCOPE = 'Current Node.js Extension Host process; NOT individual extension usage; excludes separate language-server processes';
export const DEFAULT_PROCESS_SAMPLE_MS = 500;

export function createNodeProcessSampleSource(): ProcessSampleSource {
  if (typeof process.cpuUsage !== 'function' ||
      typeof process.hrtime?.bigint !== 'function' ||
      typeof process.memoryUsage !== 'function') {
    throw new CollectionUnavailable('Node.js process CPU/RSS sampling is not available in this Extension Host.');
  }
  return {
    nowNs: () => process.hrtime.bigint(),
    cpuUsage: previous => process.cpuUsage(previous),
    rssBytes: () => process.memoryUsage().rss,
    sleep: ms => new Promise<void>(resolve => setTimeout(resolve, ms))
  };
}

/**
 * Measures CPU consumed by this process during an on-demand sampling window.
 * CPU% is normalized to one full CPU core, so values >100% are legitimate.
 * RSS is a snapshot near the end; no individual extension can be identified.
 */
export async function sampleCurrentProcess(
  cancelled: () => boolean,
  source: ProcessSampleSource,
  sampleMs = DEFAULT_PROCESS_SAMPLE_MS
): Promise<ProcessEvidence> {
  if (cancelled()) throw new Error('Process sampling cancelled');
  if (!Number.isFinite(sampleMs) || sampleMs <= 0 || sampleMs > 3000) {
    throw new Error('Invalid process sampling duration');
  }
  const startCpu = source.cpuUsage();
  const startNs = source.nowNs();

  // Cooperative cancellation: wake at most once every 50ms; never poll in the background.
  let remainingMs = sampleMs;
  while (remainingMs > 0) {
    if (cancelled()) throw new Error('Process sampling cancelled');
    const slice = Math.min(50, remainingMs);
    await source.sleep(slice);
    remainingMs -= slice;
  }
  if (cancelled()) throw new Error('Process sampling cancelled');

  const elapsedMs = Number(source.nowNs() - startNs) / 1_000_000;
  const cpu = source.cpuUsage(startCpu);
  const rss = source.rssBytes();
  const busyMicroseconds = cpu.user + cpu.system;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 ||
      !Number.isFinite(busyMicroseconds) || cpu.user < 0 || cpu.system < 0 ||
      !Number.isFinite(rss) || rss < 0) {
    throw new Error('Invalid process sampling counters');
  }

  // busy CPU time (microseconds) / elapsed wall time (microseconds) x 100.
  const cpuPercentOneCore = Math.round((busyMicroseconds / (elapsedMs * 1000)) * 1000) / 10;
  return {
    cpuPercentOneCore,
    rssMb: Math.round(rss / (1024 * 1024) * 10) / 10,
    samplingMs: Math.round(elapsedMs),
    scope: SCOPE
  };
}
