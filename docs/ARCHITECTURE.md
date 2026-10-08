# Architecture

## v0.1 data flow
Command → report orchestrator (`src/diagnostics.ts`) → bounded process/workspace checks → findings → script-free Webview (`src/extension.ts`) → optional JSON export.

The initial implementation intentionally keeps logic small. Planned interfaces for growth:
```ts
interface DiagnosticCollector<T> {
  id: string;
  collect(context: DiagnosticContext): Promise<T>;
}
interface Analyzer<T> {
  analyze(evidence: T): Finding[];
}
```
A later refactor should introduce per-collector timeouts, structured error states, injectable clock/filesystem, cancellation support for blocking operations, and independent analyzer tests. These are tracked in GitHub Issues.

## Measurement boundaries
- `process.cpuUsage()` and `process.memoryUsage()` measure the **current Node process**, not separate extensions.
- VS Code extensions sharing an extension host cannot be isolated by `vscode.extensions.all`.
- `vscode.extensions.all` lists installed extensions and `isActive` indicates activation, not resource usage.
- Remote and virtual workspaces need specialized collectors; v0.1 scans only a local file URI.

## Threat model and privacy
No source file contents read, no outgoing requests, no background monitoring. The report avoids absolute file paths. The Webview uses no scripts, and all dynamic text is HTML-escaped.
