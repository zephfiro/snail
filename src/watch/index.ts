export { createWatchSampler } from './sampler';
export { analyzeWatchSession, downsampleWatch } from './analysis';
export type { WatchAnalysis } from './analysis';
export { WATCH_INTERVAL_MS, MAX_WATCH_DURATION_MS, MAX_WATCH_SAMPLES, MAX_WATCH_SESSIONS, isWatchSession } from './types';
export type { WatchSession, WatchSample } from './types';
export { WatchMonitor } from './monitor';
export { renderWatchAnalysis } from './view';
export type { WatchClock, WatchMonitorConfig } from './monitor';
export type { WatchStorage } from './storage';

export { renderVillainsExplorer, seriesColor } from './explorer';
export type { ExplorerSeries, ExplorerOptions } from './explorer';
