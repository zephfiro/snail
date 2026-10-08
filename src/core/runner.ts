import {
  CollectionUnavailable, type CollectorRecord, type DiagnosticContext,
  type DiagnosticModule, type EvidenceSnapshot, type Finding
} from './contracts';

export interface DiagnosticRun {
  readonly evidence: EvidenceSnapshot;
  readonly findings: Finding[];
  readonly warnings: string[];
  readonly collectors: CollectorRecord[];
}

class Snapshot implements EvidenceSnapshot {
  constructor(private readonly items: ReadonlyMap<string, unknown>) {}
  get<T>(id: string): T | undefined { return this.items.get(id) as T | undefined; }
}

type CollectorOutcome =
  | { kind: 'complete'; value: { data: unknown; warnings?: readonly string[] } }
  | { kind: 'error'; error: unknown }
  | { kind: 'cancelled' }
  | { kind: 'timed_out' };

export const DEFAULT_COLLECTOR_TIMEOUT_MS = 3000;

async function runBounded(
  module: DiagnosticModule,
  context: DiagnosticContext
): Promise<CollectorOutcome> {
  const configured = context.limits.collectors?.[module.id] ?? DEFAULT_COLLECTOR_TIMEOUT_MS;
  const timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_COLLECTOR_TIMEOUT_MS;
  let stopped = false;
  let cancelTimer: () => void = () => {};
  let unsubscribe: () => void = () => {};
  // The wrapped signal allows ongoing *cooperative* collector work to observe
  // its timeout, even though the user did not cancel the entire diagnosis.
  const scopedContext: DiagnosticContext = {
    ...context,
    cancellation: {
      get isCancellationRequested() { return stopped || context.cancellation.isCancellationRequested; }
    }
  };

  const work = Promise.resolve().then(() => module.collect(scopedContext))
    .then<CollectorOutcome>(
      value => ({ kind: 'complete', value }),
      error => ({ kind: 'error', error })
    );

  const timeout = new Promise<CollectorOutcome>(resolve => {
    const fire = () => { stopped = true; resolve({ kind: 'timed_out' }); };
    cancelTimer = context.scheduleTimeout
      ? context.scheduleTimeout(timeoutMs, fire)
      : (() => { const timer = setTimeout(fire, timeoutMs); return () => clearTimeout(timer); })();
  });
  const cancellation = new Promise<CollectorOutcome>(resolve => {
    const fire = () => { stopped = true; resolve({ kind: 'cancelled' }); };
    const subscription = context.cancellation.onCancellationRequested?.(fire);
    unsubscribe = () => subscription?.dispose();
    if (context.cancellation.isCancellationRequested) fire();
  });

  try {
    const outcome = await Promise.race([work, timeout, cancellation]);
    // Cancellation may race a resolved collection; never publish cancelled data.
    if (context.cancellation.isCancellationRequested) return { kind: 'cancelled' };
    return outcome;
  } finally {
    cancelTimer();
    unsubscribe();
    // A timed-out collector may still have an I/O call pending; from here on
    // the scoped signal is cancelled and no late result enters the snapshot.
    stopped = true;
  }
}

export class DiagnosticRunner {
  constructor(private readonly modules: readonly DiagnosticModule[]) {
    const ids = modules.map(module => module.id);
    if (ids.some(id => !id.trim()) || new Set(ids).size !== ids.length) {
      throw new Error('Diagnostic collector IDs must be unique and non-empty');
    }
  }

  async run(context: DiagnosticContext): Promise<DiagnosticRun> {
    const data = new Map<string, unknown>();
    const warnings: string[] = [];
    const collectors: CollectorRecord[] = [];
    const findings: Finding[] = [];
    let cancelled = false;

    for (const module of this.modules) {
      if (context.cancellation.isCancellationRequested) cancelled = true;
      if (cancelled) {
        collectors.push({ id: module.id, status: 'skipped', durationMs: 0 });
        continue;
      }

      const start = context.now();
      const outcome = await runBounded(module, context);
      const durationMs = Math.max(0, context.now() - start);
      const status: CollectorRecord['status'] =
        outcome.kind === 'complete' ? 'collected' :
        outcome.kind === 'timed_out' ? 'timed_out' :
        outcome.kind === 'cancelled' ? 'skipped' :
        outcome.error instanceof CollectionUnavailable ? 'unavailable' : 'failed';
      collectors.push({ id: module.id, status, durationMs });

      if (outcome.kind === 'complete') {
        data.set(module.id, outcome.value.data);
        warnings.push(...(outcome.value.warnings ?? []));
      } else if (outcome.kind === 'timed_out') {
        warnings.push('Collector ' + module.id + ' exceeded its ' +
          (context.limits.collectors?.[module.id] ?? DEFAULT_COLLECTOR_TIMEOUT_MS) +
          'ms budget; results are partial.');
      } else if (outcome.kind === 'cancelled') {
        cancelled = true;
      } else if (outcome.error instanceof CollectionUnavailable) {
        warnings.push(outcome.error.message);
      } else {
        // Do not leak paths or secrets from native I/O errors.
        warnings.push('Collector ' + module.id + ' failed; other checks continued.');
      }
      if (context.cancellation.isCancellationRequested) cancelled = true;
    }

    const snapshot = new Snapshot(data);
    for (const module of this.modules) {
      if (!data.has(module.id) || !module.analyze) continue;
      try {
        const results = module.analyze(data.get(module.id), snapshot);
        for (const finding of results) {
          findings.push({ ...finding, sources: finding.sources ?? [module.id] });
        }
      } catch {
        warnings.push('Analyzer ' + module.id + ' failed; other findings were preserved.');
      }
    }
    if (cancelled) warnings.push('Diagnosis was cancelled; results may be partial.');
    return { evidence: snapshot, findings, warnings, collectors };
  }
}
