import type { ProcessSampleSource } from '../measurements/process';
import type { WatchSample } from './types';

export interface WatchSampler {
  capture(at: string): WatchSample;
}
/**
 * Low-overhead counter deltas from the CURRENT Node extension-host process.
 * Each tick reads process.cpuUsage, hrtime and RSS once (plus baseline update).
 * It does not execute profilers or inspect source/other processes.
 */
export function createWatchSampler(source: ProcessSampleSource, intervalMs: number): WatchSampler {
  let previousCpu = source.cpuUsage();
  let previousNs = source.nowNs();
  return {
    capture(at): WatchSample {
      const currentNs = source.nowNs();
      const elapsedMs = Number(currentNs - previousNs) / 1_000_000;
      previousNs = currentNs;
      let cpu;
      try {
        cpu = source.cpuUsage(previousCpu);
        previousCpu = source.cpuUsage();
        const rss = source.rssBytes();
        if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 ||
            !Number.isFinite(cpu.user) || !Number.isFinite(cpu.system) ||
            cpu.user < 0 || cpu.system < 0 ||
            !Number.isFinite(rss) || rss < 0) throw new Error('Invalid CPU/RSS sample');
        // Do not interpolate skipped/delayed intervals as real performance data.
        if (elapsedMs > intervalMs * 2.5) {
          return { kind: 'gap', timestamp: at, elapsedMs, reason: 'delayed' };
        }
        const cpuPercentOneCore = Math.round(((cpu.user + cpu.system) / (elapsedMs * 1000)) * 1000) / 10;
        const rssMiB = Math.round(rss / 1048576 * 10) / 10;
        return { kind: 'measured', timestamp: at, elapsedMs, cpuPercentOneCore, rssMiB };
      } catch {
        // Best effort to reset a failed sampler; callers keep the gap explicit.
        try { previousCpu = source.cpuUsage(); } catch { /* unavailable */ }
        return { kind: 'gap', timestamp: at, elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : 0, reason: 'unavailable' };
      }
    }
  };
}
