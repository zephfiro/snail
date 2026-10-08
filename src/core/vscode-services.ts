import * as vscode from 'vscode';
import { scanWorkspace } from '../workspace-scan';
import type { DiagnosticServices } from './contracts';
import { createNodeProcessSampleSource, sampleCurrentProcess } from '../measurements/process';

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
    workspaceRoots: () => (vscode.workspace.workspaceFolders ?? []).map(root => ({
      scheme: root.uri.scheme, fsPath: root.uri.fsPath
    })),
    workspaceRoot: () => {
      const root = vscode.workspace.workspaceFolders?.[0];
      return root ? { scheme: root.uri.scheme, fsPath: root.uri.fsPath } : undefined;
    },
    watcherExclude: () =>
      vscode.workspace.getConfiguration('files').get<Record<string, boolean>>('watcherExclude') ?? {},
    searchExclude: () =>
      vscode.workspace.getConfiguration('search').get<Record<string, boolean>>('exclude') ?? {},
    tsServerLogLevel: () =>
      vscode.workspace.getConfiguration('typescript').get('tsserver.log'),
    sampleProcess: cancelled => sampleCurrentProcess(cancelled, createNodeProcessSampleSource()),
    scanWorkspace
  };
}
