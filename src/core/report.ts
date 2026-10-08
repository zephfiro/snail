import type {
  ExtensionsEvidence, ProcessEvidence, Report, WorkspaceEvidence
} from './contracts';
import type { DiagnosticRun } from './runner';

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
      limitReached: workspace?.scan.limitReached ?? false
    },
    ...(process ? { process } : {}),
    ...(extensions?.entries ? { extensionInventory: extensions.entries } : {}),
    findings: run.findings,
    warnings: run.warnings,
    collectors: run.collectors
  };
}
