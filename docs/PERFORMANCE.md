# Performance budgets and release acceptance

Snail Doctor diagnostics run only when requested. They do not install background monitors.

## Current budgets

- Total collection scheduling: 6,500 ms. Once reached, later collectors are skipped and results are marked partial.
- Collectors: extensions 1,000 ms, Node process 1,200 ms, workspace 2,500 ms, settings 1,000 ms.
- Workspace: up to 2,500 entries, 2,000 ms, depth 5 across all roots. Symlinks are ignored.
- CPU/RSS: default 500 ms sample of the Node process running Snail, NOT any individual extension or tsserver process.
- Individual and total durations appear in the local report.

**Important:** A deadline bounds how long the diagnosis waits. A pending native filesystem I/O operation cannot be forcibly stopped. Rendering time and startup time are not hard bounded.

## Reproducible synthetic benchmark

Run `npm install && npm run benchmark`.

The script simulates three streaming directories with 100,000 entries and verifies that Snail only consumes its 2,500-entry budget. It prints JSON timing observations and checks collector startup. This is NOT a production benchmark or a claim of responsiveness on user hardware.

## Manual acceptance protocol

1. Diagnose a small workspace and a large monorepo at least three times each, both idle and during reproducible slowness.
2. Record total duration, per-collector durations, skipped/timeout states and memory observations.
3. Repeat with multiple roots and an inaccessible or virtual workspace.
4. Confirm editor responsiveness and cancellation behavior; never infer that partial results mean a healthy workspace.
5. Do not upload source files, internal extension identities, logs or private paths.

## Packaged extension acceptance

Run `npm run package` to create `snail-doctor-0.1.0.vsix`. GitHub Actions builds, typechecks, tests the VS Code Extension Host, checks package contents, and installs the VSIX into an isolated extension directory.

The CI artifact is retained for 14 days. Packaged installation testing does not replace a manual test of the extension in the actual developer workspace. Marketplace publication is out of scope.
