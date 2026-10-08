import * as vscode from 'vscode';
import { scanWorkspace } from '../workspace-scan';
import type { DiagnosticServices, ProcessEvidence } from './contracts';

async function sampleProcess(cancelled: () => boolean): Promise<ProcessEvidence> {
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

/** The only layer allowed to read VS Code APIs and Node process state. */
export function createVSCodeServices(): DiagnosticServices {
  return {
    listExtensions: () => vscode.extensions.all.map(extension => {
      // Copy a small snapshot of public API fields; never call extension.activate().
      // packageJSON is untyped by VS Code, so the collector validates every field.
      let manifest: Record<string, unknown> = {};
      try {
        if (extension.packageJSON && typeof extension.packageJSON === 'object') {
          manifest = extension.packageJSON as Record<string, unknown>;
        }
      } catch { /* An extension may disappear or expose inaccessible metadata. */ }
      return {
        id: extension.id, isActive: extension.isActive,
        extensionKind: extension.extensionKind,
        displayName: manifest.displayName,
        version: manifest.version,
        isBuiltin: manifest.isBuiltin
      };
    }),
    workspaceRoot: () => {
      const root = vscode.workspace.workspaceFolders?.[0];
      return root ? { scheme: root.uri.scheme, fsPath: root.uri.fsPath } : undefined;
    },
    watcherExclude: () =>
      vscode.workspace.getConfiguration('files').get<Record<string, boolean>>('watcherExclude') ?? {},
    sampleProcess,
    scanWorkspace
  };
}
