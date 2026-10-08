import {
  CollectionUnavailable, type DiagnosticCollector, type WorkspaceEvidence
} from '../core/contracts';
import type { ScanLimitReason, ScanResult } from '../workspace-scan';

const DEFAULT_ENTRIES = 2500;
const DEFAULT_MS = 2000;

function addReason(scan: ScanResult, reason: ScanLimitReason): void {
  scan.limitReached = true;
  if (!scan.limitReasons.includes(reason)) scan.limitReasons.push(reason);
}

export const workspaceCollector: DiagnosticCollector<WorkspaceEvidence> = {
  id: 'workspace',
  async collect(context) {
    const supplied = context.services.workspaceRoots?.();
    const fallback = context.services.workspaceRoot();
    const roots = supplied ?? (fallback ? [fallback] : []);
    const accessible = roots.filter(root => root.scheme === 'file');
    if (!accessible.length) {
      throw new CollectionUnavailable(
        'No file-backed workspace folder is available for the bounded scan (virtual folders are not inspected).'
      );
    }

    const warnings: string[] = [];
    const unsupported = roots.length - accessible.length;
    if (unsupported) warnings.push(unsupported + ' virtual workspace folders were skipped.');
    const maxEntries = context.limits.workspace.maxEntries ?? DEFAULT_ENTRIES;
    const maxMs = context.limits.workspace.maxMs ?? DEFAULT_MS;
    const started = context.now();
    const combined: ScanResult = {
      entries: 0, limitReached: false, candidates: [], skippedDirectories: 0,
      scannedDirectories: 0, skippedSymlinks: 0, depthLimitedDirectories: 0, limitReasons: []
    };
    const candidateNames = new Set<string>();

    // Treat all roots as ONE scan, with a shared deadline and entry budget.
    for (const root of accessible) {
      if (context.cancellation.isCancellationRequested) throw new Error('Workspace scan cancelled');
      const remainingMs = maxMs - (context.now() - started);
      const remainingEntries = maxEntries - combined.entries;
      if (remainingMs <= 0) { addReason(combined, 'time'); break; }
      if (remainingEntries <= 0) { addReason(combined, 'entries'); break; }
      try {
        const scan = await context.services.scanWorkspace(
          root.fsPath,
          () => context.cancellation.isCancellationRequested,
          { ...context.limits.workspace, now: context.now, maxMs: remainingMs, maxEntries: remainingEntries }
        );
        if (context.cancellation.isCancellationRequested) throw new Error('Workspace scan cancelled');
        combined.entries += scan.entries;
        combined.skippedDirectories += scan.skippedDirectories;
        combined.scannedDirectories += scan.scannedDirectories ?? 0;
        combined.skippedSymlinks += scan.skippedSymlinks ?? 0;
        combined.depthLimitedDirectories += scan.depthLimitedDirectories ?? 0;
        for (const name of scan.candidates) candidateNames.add(name);
        for (const reason of scan.limitReasons ?? []) addReason(combined, reason);
        if (scan.limitReached) combined.limitReached = true;
        if (combined.limitReasons.includes('time') || combined.limitReasons.includes('entries')) break;
      } catch {
        if (context.cancellation.isCancellationRequested) throw new Error('Workspace scan cancelled');
        combined.skippedDirectories++;
        addReason(combined, 'unreadable');
      }
    }
    combined.candidates = [...candidateNames].sort();
    if (combined.skippedDirectories) {
      warnings.push('Could not read ' + combined.skippedDirectories + ' directories; workspace scan is partial.');
    }
    if (combined.skippedSymlinks) {
      warnings.push('Skipped ' + combined.skippedSymlinks + ' symbolic links to avoid following paths outside the workspace.');
    }
    if (combined.depthLimitedDirectories) {
      warnings.push('Stopped descending into ' + combined.depthLimitedDirectories + ' directories at the configured depth limit.');
    }
    if (combined.limitReasons.some(reason => reason === 'time' || reason === 'entries')) {
      warnings.push('Workspace scan reached its time or entry limit: results are partial.');
    }
    return { data: { scan: combined }, warnings };
  }
};
