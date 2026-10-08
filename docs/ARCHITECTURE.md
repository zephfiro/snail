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
- Every collector has a wall-clock response deadline; timeout and cancellation suppress late results. Pending native filesystem operations are **cooperatively** interrupted after their in-flight await resolves, not forcibly killed.

## Bounded diagnostics and workspaces (#4)

- `DiagnosticRunner` enforces per-collector response deadlines. The command defaults to budgets of **extensions 1000ms, process 1200ms, workspace 2500ms, settings 1000ms**. New collectors use a conservative 3000ms fallback until configured. The typed `CollectorRecord.status` distinguishes `collected`, `unavailable`, `failed`, `timed_out`, and `skipped`.
- The runner uses a cancellation-event race when the VS Code token provides `onCancellationRequested`, so an unresponsive collector does not block the command. It also passes a derived `isCancellationRequested` signal to the collector; on timeout, that signal becomes true so ongoing cooperative work winds down. Late results cannot enter the evidence snapshot and arbitrary errors never appear in user-facing warnings.
- **Important limit:** a pending native filesystem operation cannot be forcibly terminated. A timeout bounds how long the command waits, not how long a single already-issued OS operation continues. Async directory enumeration avoids the blocking overhead of reading an entire enormous folder into an array.
- `scanWorkspace` streams entries through `fs.opendir` and an async iterator. It does not follow symlinks or read file contents. It uses entry, depth, time, and event-loop-yield budgets (yield every 128 entries); its injectable `openDirectory` and monotonic clock support deterministic tests.
- Metadata: `entries`, `scannedDirectories`, `skippedDirectories`, `skippedSymlinks`, `depthLimitedDirectories`, `limitReached`, `limitReasons`, and fixed-name directory candidates. No scanned path is stored in the report.
- The workspace collector traverses each accessible file-backed root in order with **shared** entry/time budgets. Virtual URI roots are skipped with a warning; a completely virtual/no-workspace environment is `unavailable`. For Remote SSH/WSL/containers, whether file-backed roots are readable depends on where the extension host executes.
- Incomplete scans, inaccessible roots, depth caps and timeouts must not be interpreted as a clean health result. The report marks an unsuccessful/timed-out workspace collection as incomplete.
- Total command time remains influenced by independent collector budgets and synchronous rendering. This version does not establish a strict whole-command SLA; overhead measurement is tracked in #13.

## Guided investigation and manual experiments (#22–#25)

`src/doctor/investigation.ts` contains static, side-effect-free investigation plans for host, watcher, extension, configuration, language-server and workspace suspects. The explicit TypeScript flow differentiates the Node Extension Host from the separate `tsserver`, references only VS Code's supported inspection commands, and never collects logs automatically. `src/doctor/investigation-view.ts` renders plans in a script-free, escaped Webview.

`src/doctor/commands.ts` registers the investigation and manual A/B commands. The VS Code QuickPick and InputBox UI only runs after user action; no timers or processes start at activation. Baseline data is stored **only with explicit confirmation** in `ExtensionContext.workspaceState`, capped to one pending baseline and four past trials. `Snail: Clear Experiment Data` clears both keys. The stored model contains only operation type, observations in milliseconds, timestamps and coarse environment signature (VS Code version, local/remote, folder count); no workspace path or log content.

`src/doctor/experiments.ts` is a deterministic, independent comparison module. All observations need >=3 valid positive repetitions, matching operation, source and coarse environment. Changes are expressed as relative change in **median latency**. Different contexts or multiple interventions are marked **incomparable**. A single improvement produces at most `suspected`; repeated controlled self-reported improvements can produce `likely`, never `verified_by_experiment`. Actual verification would require repeatable, controlled, independently instrumented samples; the current UI **does not offer them**.

`tsserver` logging may include private paths or source code. Snail only gives the native `TypeScript: Open TS Server Log` command as a manual instruction and never imports the log into its data store. The integrated host CPU metric cannot be used to infer `tsserver` CPU.

## Extension inventory (#11)

The `extensions` collector reads one synchronous snapshot of `vscode.extensions.all` through the `DiagnosticServices` adapter. It copies only the extension ID, activation state, `extensionKind` (UI = 1; Workspace = 2) and a small allowlist of manifest metadata (display name, version, optional built-in flag). It never calls `activate()`, reads extension files or inspects private extension host state.

The collector normalizes and sorts entries deterministically (third-party first), rejects invalid/duplicate IDs, and reports the count of skipped entries. It counts non-built-in extensions separately to preserve the original dashboard summary. Built-ins are identified via the manifest's `isBuiltin` boolean when present, falling back to the `vscode.` ID prefix. This fallback may be imperfect for third-party or custom distributions, so it is a **classification heuristic**, not an assertion about extension origin.

A collapsed table in the local Webview exposes name, ID, version, active state, origin and logical extension kind. Up to 250 entries are rendered per diagnosis to cap HTML size, with the total displayed. The JSON export is constructed through `createShareableReport()` using an allowlist and deliberately omits the entire extension inventory (including identifiers/names/versions). It also omits freeform warnings. Additional generic scrubbers belong to #5.

The point-in-time snapshot is not a live subscription; installations, removals and updates are reflected in the **next** user-triggered diagnosis. Missing optional metadata remains unknown rather than being invented. `extensionKind` alone cannot identify the precise physical process or whether an extension is executing locally, remotely or in a web host. The setting `remote.extensionKind` may change its logical kind. See [VS Code Extension API](https://code.visualstudio.com/api/references/vscode-api#Extension) and [Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host).

## Process sampling (#12)

The `process` collector delegates to `sampleCurrentProcess(cancelled, source, sampleMs)` in `src/measurements/process.ts`. The adapter `createNodeProcessSampleSource()` is the **only** place that reads native Node process counters; a small `ProcessSampleSource` interface injects the monotonic clock, CPU counters, RSS byte snapshot and timer for deterministic unit tests.

- **Scope:** the current Node.js process running this VS Code extension, generally the local or remote Node Extension Host. It is **not** all VS Code processes and not a specific extension. Processes spawned separately (such as language servers, renderers, terminals or other Extension Hosts) are excluded.
- **CPU window:** 500 ms by default. `process.cpuUsage(start)` returns `user + system` CPU time in microseconds. `process.hrtime.bigint()` measures elapsed monotonic wall time in nanoseconds. The formula is `CPU% of one core = ((userUs + systemUs) / (elapsedMs * 1000)) * 100`. The resulting value may legitimately exceed 100% when multiple threads use more than one core; **do not clamp it**.
- **Memory:** `process.memoryUsage().rss` is a point-in-time resident set size, converted from bytes to MiB (labeled MB in the existing UI for compatibility). It is not a heap total, per-extension memory consumption or the memory of child processes.
- **Interpretation:** a high CPU sample is labeled as a *measured short observation*; it is not proof of sustained slowdown or extension attribution. The UI always shows the sample duration, its process-only scope and an explicit unavailable state.
- **Cancellation:** the 500 ms window sleeps in chunks of at most 50 ms and checks cooperative cancellation. The runner marks cancelled samples `skipped`, not `failed`. Other collector failures remain isolated. More comprehensive per-collector time budgets are part of #4.
- **Unavailability:** absent process APIs yield `CollectionUnavailable`. Unexpected errors or invalid counters are reported as generic collection failures, without paths or exception messages.

In local desktop extension hosts and remote Node hosts, Node process readings are usually available but describe **the host where Snail is executing**, which may not be the UI host. Web extension hosts cannot assume Node process APIs and may require a different adapter. In the Extension Development Host, results represent a **development/test process**, not the user's normal workload. No background sampling or remote data transmission is introduced.

## Measurement boundaries

- `process.cpuUsage()` and `process.memoryUsage()` measure the **current Node process**, not individual extensions.
- Shared extension hosts cannot be disambiguated from `vscode.extensions.all`.
- `isActive` indicates activation, not CPU/RAM consumption.
- Remote and virtual workspaces require specialized collectors; the initial scan supports only a local file URI.
- Workspace candidate directory names are heuristics, **not** measured file watcher load.

## Privacy and safety

No code contents are read, no outgoing requests are sent, no background monitoring occurs, and there are no automatic configuration changes. Findings and collector IDs avoid absolute paths. Webview dynamic strings are escaped, and scripts are disabled. Further export hardening belongs to #5.
