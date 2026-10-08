import * as vscode from 'vscode';
import { scanWorkspace } from './workspace-scan';
import * as os from 'node:os';

export type Confidence = 'measured' | 'inferred' | 'informational';
export type Severity = 'info' | 'warning' | 'critical';
export interface Finding {
  id: string;
  title: string;
  category: 'extensions' | 'process' | 'workspace' | 'settings';
  severity: Severity;
  confidence: Confidence;
  evidence: string;
  recommendation: string;
}
export interface Report {
  schemaVersion: 1;
  timestamp: string;
  environment: { vscodeVersion: string; platform: string; remote: boolean };
  summary: { installedExtensions: number; activeExtensions: number; scannedEntries: number; limitReached: boolean };
  process?: { cpuPercentOneCore: number; rssMb: number; samplingMs: number; scope: string };
  findings: Finding[];
  warnings: string[];
}
export async function sampleProcess(cancelled: () => boolean): Promise<Report['process']> {
  if (cancelled()) throw new Error('Cancelled');
  const start = process.cpuUsage();
  const since = process.hrtime.bigint();
  await new Promise<void>(resolve => setTimeout(resolve, 500));
  if (cancelled()) throw new Error('Cancelled');
  const cpu = process.cpuUsage(start);
  const elapsedMs = Number(process.hrtime.bigint() - since) / 1e6;
  return {
    cpuPercentOneCore: Math.round(((cpu.user + cpu.system) / 1000 / elapsedMs) * 1000) / 10,
    rssMb: Math.round(process.memoryUsage().rss / 1048576),
    samplingMs: Math.round(elapsedMs),
    scope: 'Current extension-host process; NOT individual extension usage'
  };
}
export async function diagnose(token: vscode.CancellationToken): Promise<Report> {
  const installed = vscode.extensions.all.filter(ext => !ext.id.startsWith('vscode.'));
  const active = installed.filter(ext => ext.isActive);
  const findings: Finding[] = [];
  const warnings: string[] = [];
  const report: Report = {
    schemaVersion: 1, timestamp: new Date().toISOString(),
    environment: {vscodeVersion: vscode.version, platform: os.platform(), remote: Boolean(vscode.env.remoteName)},
    summary: {installedExtensions: installed.length, activeExtensions: active.length, scannedEntries: 0, limitReached: false},
    findings, warnings
  };
  try { report.process = await sampleProcess(() => token.isCancellationRequested); }
  catch (e) { warnings.push('Process sample unavailable: ' + String(e)); }
  const root = vscode.workspace.workspaceFolders?.[0];
  if (root && root.uri.scheme === 'file') {
    try {
      const scan = await scanWorkspace(root.uri.fsPath, () => token.isCancellationRequested);
      report.summary.scannedEntries = scan.entries;
      report.summary.limitReached = scan.limitReached;
      if (scan.skippedDirectories > 0) warnings.push(`Could not read ${scan.skippedDirectories} directories; workspace scan is partial.`);
      if (scan.candidates.length) {
        const watches = vscode.workspace.getConfiguration('files').get<Record<string, boolean>>('watcherExclude') ?? {};
        const missing = scan.candidates.filter(c => !Object.entries(watches).some(([pattern, enabled]) => enabled && pattern.includes(c)));
        if (missing.length) findings.push({
          id: 'workspace-generated-dirs', title: 'Review generated directory exclusions', category: 'workspace',
          severity: 'info', confidence: 'inferred',
          evidence: 'Found directory names often associated with generated/dependency files: ' + missing.join(', ') + '. Only names were inspected; no costly watcher activity was measured.',
          recommendation: 'Review files.watcherExclude and search.exclude before changing anything. Some language tools still need to index these directories.'
        });
      }
      if (scan.limitReached) warnings.push('Workspace scan reached its time or entry limit: results are partial.');
    } catch (e) { warnings.push('Workspace scan unavailable: ' + String(e)); }
  } else { warnings.push('No local workspace folder available for the bounded scan (remote/virtual folders not inspected).'); }
  if (report.process && report.process.cpuPercentOneCore > 65) findings.push({
    id: 'extension-host-cpu', title: 'Extension-host CPU activity during sample', category: 'process',
    severity: 'warning', confidence: 'measured',
    evidence: `Current process used ${report.process.cpuPercentOneCore}% of one CPU core over ${report.process.samplingMs}ms; this is one short snapshot and cannot identify a specific extension.`,
    recommendation: 'Repeat during noticeable slowness; inspect Developer: Show Running Extensions and Help: Open Process Explorer for deeper attribution.'
  });
  findings.push({
    id: 'extension-inventory', title: 'Extension inventory', category: 'extensions',
    severity: 'info', confidence: 'informational',
    evidence: `${installed.length} non-built-in extensions detected; ${active.length} currently activated. Activation alone does not imply high resource usage.`,
    recommendation: 'For an extension-specific suspect, use the built-in Extension Bisect and compare behavior with the extension disabled.'
  });
  if (token.isCancellationRequested) warnings.push('Diagnosis was cancelled; results may be partial.');
  return report;
}
