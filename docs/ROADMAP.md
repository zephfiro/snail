# Roadmap

## v0.1 — Snail Doctor MVP
- [x] On-demand extension inventory, process sample and bounded workspace inspection.
- [x] Typed independent collectors, rule engine, suspect evidence and deterministic prioritization.
- [x] Guided investigation (including TypeScript Language Server) and self-reported before/after experiments.
- [x] Conservative experimental verdicts with privacy-first local storage.
- [x] Script-free findings panel and allowlisted export.
- [x] Cooperative cancellation, per-collector deadlines and multi-root scanning.
- [x] Resource budget instrumentation, synthetic benchmarking and VSIX packaging/installation CI (#13/#14).
- [ ] Manual real-workspace release acceptance before publishing to Marketplace.

## v0.2 — Advanced investigation (#8)
- [ ] Independent process profiling and time-series analysis through supported instrumentation where possible.
- [ ] Reproducible evidence for particular extension or server with stronger causality checks.
- [ ] Better experimental designs, controls and calibration of hypothesis confidence.

## v0.3 — Safe fixes (#9)
- [ ] Reviewable, reversible settings changes with explicit user consent, tests and rollback.

## v0.4 — Session-based Watch (#10)
- [x] Explicit Start/Stop and Status Bar indicator; no automatic recording on editor startup.
- [x] Limited aggregate CPU/RSS samples with gaps, safety cap and per-session local storage.
- [x] Offline history selection, static timeline, statistical summaries, cautious hypotheses, clearing and manual export.
- [ ] Validate overhead and user experience on real workspaces before Marketplace release.
