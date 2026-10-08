# Architecture

## Diagnostic pipeline

```text
VS Code command (src/extension.ts)
    ↓
Facade (src/diagnostics.ts)
    ↓
VS Code / Node adapters (src/core/vscode-services.ts)
    ↓
DiagnosticRunner (src/core/runner.ts)
    ├── DiagnosticCollector<T>       [side effects, observation]
    ├── EvidenceSnapshot             [read-only lookup by collector ID]
    └── Analyzer<T>                  [synchronous, pure, no I/O]
    ↓
createReport (src/core/report.ts)
    ↓
Script-free Webview (src/report-view.ts) / manual JSON export
```

Each collector returns `Collected<T> = { data, warnings? }`, a typed evidence payload.
`defineDiagnostic(collector, analyzer)` pairs a typed collector and analyzer, preserving the type contract while exposing a uniform `DiagnosticModule` to the runner.

The runner gathers all collectors first, **then** invokes analyzers with the immutable lookup interface `EvidenceSnapshot`, so a workspace analysis can use settings evidence without calling VS Code APIs. Each collector or analyzer fails independently; failures are captured as collector statuses or static warnings. Arbitrary error messages and stack traces are never included in reports. Collector durations use an injectable monotonic clock.

`createDefaultModules()` in `src/core/default-modules.ts` is the only list of modules.
The runner never needs edits when adding new collectors.

## Adding a new collector

1. Define an evidence shape `T` in `src/core/contracts.ts` (or another domain file).
2. Add `src/collectors/your-check.ts`, exporting `DiagnosticCollector<T>`.
3. Optionally add a synchronous `Analyzer<T>` in `src/analyzers/`. Analyzers may only use their typed evidence plus `EvidenceSnapshot`, **not** file system, process metrics, or VS Code APIs.
4. Register with `defineDiagnostic(yourCollector, yourAnalyzer)` in `createDefaultModules()`.
5. Add unit tests with fake `DiagnosticServices`, then validate in the Extension Development Host.

Example:
```ts
import { defineDiagnostic } from './contracts';
const collector = {
  id: 'my-check',
  async collect(_context: DiagnosticContext) {
    return { data: { count: 2 } };
  }
};
const analyzer = {
  analyze(data: {count: number}) {
    return data.count > 1 ? [/* typed findings */] : [];
  }
};
const module = defineDiagnostic(collector, analyzer);
```

## Contracts and collected evidence

- `DiagnosticContext` provides cancellation, `now(): number`, resource limits and **injected** services.
- `CollectorRecord` has ID, status (`collected`, `unavailable`, `failed`, `skipped`) and duration.
- `Finding.sources` links conclusions to the collector(s) that produced their evidence.
- `createReport` assembles a backwards-compatible summary and the collected statuses.
- `CollectionUnavailable` is reserved for known, static unsupported-environment messages.
- The current runner uses *cooperative cancellation*, not hard termination of blocked operations. Per-collector timeout enforcement is tracked in #4.

## Extension inventory (#11)

The `extensions` collector reads one synchronous snapshot of `vscode.extensions.all` through the `DiagnosticServices` adapter. It copies only the extension ID, activation state, `extensionKind` (UI = 1; Workspace = 2) and a small allowlist of manifest metadata (display name, version, optional built-in flag). It never calls `activate()`, reads extension files or inspects private extension host state.

The collector normalizes and sorts entries deterministically (third-party first), rejects invalid/duplicate IDs, and reports the count of skipped entries. It counts non-built-in extensions separately to preserve the original dashboard summary. Built-ins are identified via the manifest's `isBuiltin` boolean when present, falling back to the `vscode.` ID prefix. This fallback may be imperfect for third-party or custom distributions, so it is a **classification heuristic**, not an assertion about extension origin.

A collapsed table in the local Webview exposes name, ID, version, active state, origin and logical extension kind. Up to 250 entries are rendered per diagnosis to cap HTML size, with the total displayed. The JSON export is constructed through `createShareableReport()` using an allowlist and deliberately omits the entire extension inventory (including identifiers/names/versions). It also omits freeform warnings. Additional generic scrubbers belong to #5.

The point-in-time snapshot is not a live subscription; installations, removals and updates are reflected in the **next** user-triggered diagnosis. Missing optional metadata remains unknown rather than being invented. `extensionKind` alone cannot identify the precise physical process or whether an extension is executing locally, remotely or in a web host. The setting `remote.extensionKind` may change its logical kind. See [VS Code Extension API](https://code.visualstudio.com/api/references/vscode-api#Extension) and [Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host).

## Measurement boundaries

- `process.cpuUsage()` and `process.memoryUsage()` measure the **current Node process**, not individual extensions.
- Shared extension hosts cannot be disambiguated from `vscode.extensions.all`.
- `isActive` indicates activation, not CPU/RAM consumption.
- Remote and virtual workspaces require specialized collectors; the initial scan supports only a local file URI.
- Workspace candidate directory names are heuristics, **not** measured file watcher load.

## Privacy and safety

No code contents are read, no outgoing requests are sent, no background monitoring occurs, and there are no automatic configuration changes. Findings and collector IDs avoid absolute paths. Webview dynamic strings are escaped, and scripts are disabled. Further export hardening belongs to #5.
