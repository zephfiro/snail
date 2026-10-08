# Snail Doctor 🐌

**Find out what's slowing down your VS Code.**

Snail Doctor is an open-source, on-demand performance diagnostic extension for Visual Studio Code. It gathers lightweight evidence about the extension host, installed extensions, workspace structure and relevant settings, then reports **measurements**, **hypotheses** and **practical next steps** without pretending to know more than it can measure.

> Early development — v0.1.0. The public VS Code extension API does **not** provide reliable per-extension CPU or memory usage. Snail will never fabricate those figures.

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
- Bounded workspace directory inspection (names and directory types only; no file contents).
- Possible file-watching and search-exclusion opportunities, with hypotheses labeled as such.
- Failures and collection limits, so an incomplete scan is not mistaken for a complete one.
- Exportable JSON report through **Snail: Export Last Report**. Extension IDs, names and versions appear only inside the local Webview and are omitted from the export by default. Other privacy safeguards are tracked in #5.

The inventory is a point-in-time snapshot: changes made by installing, uninstalling or enabling extensions appear in the next diagnosis. The `extensionKind` is the logical UI/Workspace kind exposed by VS Code, **not** a definitive physical extension host location. `isActive` indicates activation, not performance or CPU usage.

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
