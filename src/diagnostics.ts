import * as vscode from 'vscode';
import * as os from 'node:os';
import { DiagnosticRunner } from './core/runner';
import { createDefaultModules } from './core/default-modules';
import { createReport } from './core/report';
import { createVSCodeServices } from './core/vscode-services';
import type { Report } from './core/contracts';

export type { Finding, Report, Confidence, Severity } from './core/contracts';

/** Public command-facing facade. Collection and analysis live in independent modules. */
export async function diagnose(token: vscode.CancellationToken): Promise<Report> {
  const runner = new DiagnosticRunner(createDefaultModules());
  const result = await runner.run({
    cancellation: token,
    // A monotonic clock avoids wall-clock adjustments during duration measurement.
    now: () => Number(process.hrtime.bigint()) / 1_000_000,
    limits: { workspace: { maxEntries: 2500, maxDepth: 5, maxMs: 2000 } },
    services: createVSCodeServices()
  });
  return createReport(result, {
    vscodeVersion: vscode.version,
    platform: os.platform(),
    remote: Boolean(vscode.env.remoteName)
  }, new Date().toISOString());
}
