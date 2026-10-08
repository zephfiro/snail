# Snail Doctor 🐌

**Find out what's slowing down your VS Code.**

Snail Doctor is an open-source, on-demand performance diagnostic extension for Visual Studio Code. It gathers lightweight evidence about the extension host, installed extensions, workspace structure and relevant settings, then reports **measurements**, **hypotheses** and **practical next steps** without pretending to know more than it can measure.

> Early development — v0.1.0. The public VS Code extension API does **not** provide reliable per-extension CPU or memory usage. Snail will never fabricate those figures.

## VSIX installation

Run `npm install && npm run package` to create `snail-doctor-0.1.0.vsix`. From VS Code, open Extensions (`Ctrl+Shift+X`), choose the `...` menu, click **Install from VSIX...**, and select that file. You can also obtain the package from the most recent successful [GitHub Actions run](https://github.com/zephfiro/snail/actions) as an artifact.

To uninstall, open Extensions, find **Snail Doctor**, and click Uninstall. For a development session instead, open the repository in VS Code and press **F5**.

See [resource budgets and release acceptance](docs/PERFORMANCE.md) for synthetic benchmark and real-workspace verification guidance.

## Snail Watch — session-based performance monitoring

Snail Watch is **OFF by default**. Click **Snail Watch: OFF** in the VS Code Status Bar or run **Snail: Start Watch**, then choose a recording duration or **Until I stop** (with a two-hour safety limit). Continue working in VS Code and click **Watch: ON** to stop when done.

Your CPU/RSS history is saved **locally by session**, even when Watch is OFF. Run **Snail: Open Watch Sessions** later to examine charts, spikes, memory trends and missing data; you can also export a session or clear local history. None of this assigns CPU or memory to a specific extension.

See [Snail Watch documentation](docs/WATCH.md) for data scope, persistence, retention, safety limits and commands.

## Quick start

Requires Node.js 22+, npm and VS Code 1.94+.

```bash
npm install
npm run build
npm run lint
npm test
npm run test:integration
```

Unit tests run with Node's built-in test runner. The integration suite uses `@vscode/test-electron`, which downloads a VS Code test build on its first execution and launches a real Extension Development Host. On headless Linux, run `xvfb-run -a npm run test:integration`. CI runs build, typecheck, unit tests and Extension Host integration on each pull request.

Open the folder in VS Code, press **F5** to launch the Extension Development Host, and run **Snail: Diagnose Performance** from the Command Palette.

The initial version collects evidence only when explicitly invoked. It does not disable extensions, modify settings, transmit telemetry, inspect file contents or run arbitrary shell commands.

The existing smoke tests check packaging and manifest invariants; unit tests exercise bounded scanning, HTML escaping, confidence labels, failures and diagnosis results. The integration suite checks command registration, extension activation and diagnosis execution in a real VS Code host.

## What v0.1.0 diagnoses

- Local-only extension inventory: ID, display name, version (when available), built-in/third-party status, activation and UI/Workspace kind. This is **not** an individual CPU/RAM report.
- On-demand, 500 ms aggregate CPU (% of a single core, potentially >100%) and RSS (MB/MiB approximation) of the Node Extension Host running Snail. The Webview displays scope and duration, or `N/A` when unavailable. These are **not** per-extension values or proof of sustained high load.
- Asynchronous streaming directory inspection (names/types only), with shared limits across multi-root workspaces: 2,500 entries, depth 5, and 2 seconds by default. Unreadable folders, symbolic links, and depth truncation are recorded without exposing paths.
- Possible file-watching and search-exclusion opportunities, with hypotheses labeled as such.
- Failures and collection limits, so an incomplete scan is not mistaken for a complete one.
- Exportable JSON report through **Snail: Export Last Report**. The shareable file contains only known finding/suspect codes and numeric aggregates, with arbitrary evidence text, local extension IDs/versions, user paths, warnings and logs removed. Source evidence remains in the local view.

The inventory is a point-in-time snapshot: changes made by installing, uninstalling or enabling extensions appear in the next diagnosis. The `extensionKind` is the logical UI/Workspace kind exposed by VS Code, **not** a definitive physical extension host location. `isActive` indicates activation, not performance or CPU usage.

The settings checks use effective `files.watcherExclude`, `search.exclude` and TypeScript logging configuration. Missing exclusions and verbose logging produce **configuration hypotheses**, not measured file I/O, TypeScript Server CPU, or a finding of guilt.

## Cancellation and resource budgets

When you cancel the VS Code progress notification, the runner stops scheduling collectors and returns an explicitly partial report. Each collector also has a hard **response deadline** (extensions: 1s; process: 1.2s; workspace: 2.5s; settings: 1s). A timed-out collector's late results are ignored, and other collectors continue.

Workspace enumeration uses `fs.opendir` to stream entries without loading huge directory arrays; scans are cooperatively stopped between asynchronous operations. Pending OS filesystem operations **cannot be forcibly terminated**, so the hard deadline bounds the command's wait, while a late operation may finish before it observes cancellation. This is not a claim of real-time interruption or zero background I/O.

Virtual workspace roots are skipped; remote `file:` roots are scanned only if accessible from the Extension Host running Snail. Partial scans are shown as incomplete, not as evidence that no problem exists.

## Find and investigate suspects

1. Run **Snail: Diagnose Performance** and review the **Potential performance suspects** section. A suspect is a hypothesis supported by observed evidence, not a confirmed culprit.
2. Run **Snail: Investigate a Performance Suspect** to choose a current suspect and read a safe, reproducible checklist.
3. Run **Snail: Investigate TypeScript Language Server** to investigate the built-in TS Server specifically. The Snail Extension Host CPU sample **does not measure tsserver**.
4. If you want a manual experiment, run **Snail: Record Baseline**. Explicitly consent to workspace-local storage and enter three or more self-timed latencies for an editor action, in milliseconds (e.g. `250,240,260`).
5. Change exactly one reversible variable outside Snail, repeat the same action, then run **Snail: Record Comparison**. Record the new latencies and whether you reversed the change. Read the comparison report.
6. Repeat controlled experiments if useful; use **Snail: Clear Experiment Data** to delete stored observations.

No automatic setting edits, file changes, extension disabling, process sampling of tsserver, or logs are performed in this workflow. Self-reported timings may suggest a cause but never produce a **verified** verdict. The experiment store retains only the current baseline and up to **four** recent comparisons within the VS Code workspace state: action type, timings, VS Code version, local/remote flag and folder count. It does **not** save paths, file contents, TypeScript logs or names of internal extensions. Repeating an experiment after a major TypeScript version or load change may not be comparable even when the automatic environment signature matches.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/PRODUCT.md](docs/PRODUCT.md), and [docs/ROADMAP.md](docs/ROADMAP.md). Contributors can start with [CONTRIBUTING.md](CONTRIBUTING.md).

## Principles

1. **Evidence before conclusions:** measured, inferred and informational findings are clearly distinguished.
2. **Zero surprise:** diagnose on demand, do not change configuration without permission.
3. **Small footprint:** bounded traversals, bounded sampling, no background polling.
4. **Respect privacy:** avoid reading file contents; reports omit absolute filesystem paths.
5. **Honest limitations:** shared processes and remote environments complicate attribution.

## License

MIT. See [LICENSE](LICENSE).
