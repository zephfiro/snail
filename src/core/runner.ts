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
/** A plain in-memory map; the returned accessor cannot mutate evidence. */
class Snapshot implements EvidenceSnapshot {
  constructor(private readonly items: ReadonlyMap<string, unknown>) {}
  get<T>(id: string): T | undefined {
    return this.items.get(id) as T | undefined;
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
      try {
        const collected = await module.collect(context);
        if (context.cancellation.isCancellationRequested) {
          cancelled = true;
          collectors.push({ id: module.id, status: 'skipped', durationMs: Math.max(0, context.now() - start) });
          continue;
        }
        data.set(module.id, collected.data);
        collectors.push({ id: module.id, status: 'collected', durationMs: Math.max(0, context.now() - start) });
        warnings.push(...(collected.warnings ?? []));
      } catch (error) {
        const wasCancelled = context.cancellation.isCancellationRequested;
        const unavailable = error instanceof CollectionUnavailable;
        collectors.push({
          id: module.id,
          status: wasCancelled ? 'skipped' : unavailable ? 'unavailable' : 'failed',
          durationMs: Math.max(0, context.now() - start)
        });
        // Never leak filesystem paths, stack traces, or configuration secrets from arbitrary errors.
        if (!wasCancelled) {
          warnings.push(unavailable ? error.message : 'Collector ' + module.id + ' failed; other checks continued.');
        }
        if (wasCancelled) cancelled = true;
      }
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
