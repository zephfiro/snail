import type { ScanOptions, ScanResult } from '../workspace-scan';

export type Confidence = 'measured' | 'inferred' | 'informational';
export type Severity = 'info' | 'warning' | 'critical';
export type Category = 'extensions' | 'process' | 'workspace' | 'settings';

export interface Finding {
  id: string;
  title: string;
  category: Category;
  severity: Severity;
  confidence: Confidence;
  evidence: string;
  recommendation: string;
  /** Collector IDs that produced the evidence (no filesystem paths). */
  sources?: readonly string[];
}
export interface ProcessEvidence {
  cpuPercentOneCore: number;
  rssMb: number;
  samplingMs: number;
  scope: string;
}
export interface ExtensionsEvidence {
  installedExtensions: number;
  activeExtensions: number;
}
export interface WorkspaceEvidence {
  scan: ScanResult;
}
export interface SettingsEvidence {
  watcherExclude: Readonly<Record<string, boolean>>;
}
export interface CollectorRecord {
  id: string;
  status: 'collected' | 'unavailable' | 'failed' | 'skipped';
  durationMs: number;
}
export interface Report {
  schemaVersion: 1;
  timestamp: string;
  environment: { vscodeVersion: string; platform: string; remote: boolean };
  summary: { installedExtensions: number; activeExtensions: number; scannedEntries: number; limitReached: boolean };
  process?: ProcessEvidence;
  findings: Finding[];
  warnings: string[];
  collectors: CollectorRecord[];
}

export interface CancellationSignal {
  readonly isCancellationRequested: boolean;
}
export interface DiagnosticServices {
  listExtensions(): readonly { id: string; isActive: boolean }[];
  workspaceRoot(): { scheme: string; fsPath: string } | undefined;
  watcherExclude(): Readonly<Record<string, boolean>>;
  sampleProcess(cancelled: () => boolean): Promise<ProcessEvidence>;
  scanWorkspace(folder: string, cancelled: () => boolean, options: ScanOptions): Promise<ScanResult>;
}
export interface DiagnosticContext {
  readonly cancellation: CancellationSignal;
  /** Injectable monotonic clock (milliseconds). */
  readonly now: () => number;
  readonly limits: { readonly workspace: ScanOptions };
  readonly services: DiagnosticServices;
}
export interface Collected<T> {
  data: T;
  warnings?: readonly string[];
}
export interface DiagnosticCollector<T> {
  readonly id: string;
  collect(context: DiagnosticContext): Promise<Collected<T>>;
}
/** Read-only evidence snapshot; analyzers must stay synchronous and perform no I/O. */
export interface EvidenceSnapshot {
  get<T>(collectorId: string): T | undefined;
}
export interface Analyzer<T> {
  analyze(data: T, evidence: EvidenceSnapshot): readonly Finding[];
}
/**
 * Erases T only after pairing the collector with its compatible analyzer.
 * Adding a module never requires edits to the diagnostic runner.
 */
export interface DiagnosticModule {
  readonly id: string;
  collect(context: DiagnosticContext): Promise<Collected<unknown>>;
  analyze?(data: unknown, evidence: EvidenceSnapshot): readonly Finding[];
}
export function defineDiagnostic<T>(collector: DiagnosticCollector<T>, analyzer?: Analyzer<T>): DiagnosticModule {
  return {
    id: collector.id,
    collect: context => collector.collect(context),
    analyze: analyzer ? (data, evidence) => analyzer.analyze(data as T, evidence) : undefined
  };
}
/** Expected lack of support. Message must be a safe, static, user-facing string. */
export class CollectionUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CollectionUnavailable';
  }
}
