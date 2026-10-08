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
/** A narrow snapshot from public VS Code Extension metadata; no activation is triggered. */
export interface ExtensionSource {
  id: unknown;
  isActive: unknown;
  displayName?: unknown;
  version?: unknown;
  isBuiltin?: unknown;
  /** VS Code ExtensionKind: 1 = UI, 2 = Workspace. Not an exact host location. */
  extensionKind?: unknown;
}
export interface ExtensionInventoryEntry {
  id: string;
  displayName: string;
  version?: string;
  isActive: boolean;
  isBuiltin: boolean;
  /** Logical extension kind, not necessarily the physical runtime host. */
  extensionKind: 'ui' | 'workspace' | 'unknown';
}
export interface ExtensionsEvidence {
  /** Number of non-built-in extensions; preserves v0.1 summary semantics. */
  installedExtensions: number;
  activeExtensions: number;
  builtinExtensions: number;
  entries: readonly ExtensionInventoryEntry[];
}
export interface WorkspaceEvidence {
  scan: ScanResult;
}
export interface SettingsEvidence {
  watcherExclude: Readonly<Record<string, boolean>>;
}
export interface CollectorRecord {
  id: string;
  status: 'collected' | 'unavailable' | 'failed' | 'skipped' | 'timed_out';
  durationMs: number;
}
export interface Report {
  schemaVersion: 1;
  timestamp: string;
  environment: { vscodeVersion: string; platform: string; remote: boolean };
  summary: { installedExtensions: number; activeExtensions: number; scannedEntries: number; limitReached: boolean };
  process?: ProcessEvidence;
  /** Local-only inventory. Never include in a shared/exported report by default. */
  extensionInventory?: readonly ExtensionInventoryEntry[];
  findings: Finding[];
  warnings: string[];
  collectors: CollectorRecord[];
}

export interface CancellationSignal {
  readonly isCancellationRequested: boolean;
  onCancellationRequested?: (listener: () => void) => { dispose(): void };
}
export interface DiagnosticServices {
  listExtensions(): readonly ExtensionSource[];
  workspaceRoot(): { scheme: string; fsPath: string } | undefined;
  /** All workspace roots; optional to keep existing injected service fixtures compatible. */
  workspaceRoots?(): readonly { scheme: string; fsPath: string }[];
  watcherExclude(): Readonly<Record<string, boolean>>;
  sampleProcess(cancelled: () => boolean): Promise<ProcessEvidence>;
  scanWorkspace(folder: string, cancelled: () => boolean, options: ScanOptions): Promise<ScanResult>;
}
export interface DiagnosticContext {
  readonly cancellation: CancellationSignal;
  /** Injectable monotonic clock (milliseconds). */
  readonly now: () => number;
  readonly limits: {
    readonly workspace: ScanOptions;
    readonly collectors?: Readonly<Record<string, number>>;
  };
  /** Test seam: schedule a deadline and return a cleanup function. */
  readonly scheduleTimeout?: (ms: number, trigger: () => void) => () => void;
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
