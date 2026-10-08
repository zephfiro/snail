import type {
  ExtensionsEvidence, ProcessEvidence, Report, WorkspaceEvidence
} from './contracts';
import type { DiagnosticRun } from './runner';
import { detectSuspects, rankSuspects } from '../doctor/index';

export function createReport(
  run: DiagnosticRun,
  environment: Report['environment'],
  timestamp: string
): Report {
  const extensions = run.evidence.get<ExtensionsEvidence>('extensions');
  const workspace = run.evidence.get<WorkspaceEvidence>('workspace');
  const process = run.evidence.get<ProcessEvidence>('process');
  return {
    schemaVersion: 1,
    timestamp,
    environment,
    summary: {
      installedExtensions: extensions?.installedExtensions ?? 0,
      activeExtensions: extensions?.activeExtensions ?? 0,
      scannedEntries: workspace?.scan.entries ?? 0,
      limitReached: workspace?.scan.limitReached ?? run.collectors.some(
        collector => collector.id === 'workspace' &&
          (collector.status === 'timed_out' || collector.status === 'skipped' || collector.status === 'failed')
      )
    },
    ...(process ? { process } : {}),
    ...(extensions?.entries ? { extensionInventory: extensions.entries } : {}),
    findings: run.findings,
    warnings: run.warnings,
    collectors: run.collectors,
    suspects: rankSuspects(detectSuspects(run.evidence, run.collectors))
  };
}
