# Product specification — Snail Doctor

## Problem
VS Code can feel slow for different reasons: extensions, language servers, watchers, Git operations, large workspaces or process-level contention. Existing built-in tools expose raw data but require technical interpretation.

## Promise
**What is slow? What is the evidence? What is the safest next step?**

## Users
Developers working on large monorepos, web projects, containers and extension-heavy setups.

## MVP commands
- `Snail: Diagnose Performance`: lightweight, on-demand diagnostic.
- `Snail: Export Last Report`: user-triggered, sanitized JSON export.

## Guardrails
- No fabricated per-extension CPU/memory metrics.
- No automated changes or disabling extensions.
- Each finding has evidence, severity, confidence, and guidance.
- No telemetry or background daemon.
- A bounded scan is a heuristic, not a complete file watcher profile.
- Never infer a causal link from extension activation alone.

## Success criteria
1. User can diagnose without learning profiler tooling.
2. A report honestly distinguishes evidence and hypothesis.
3. Scanning does not block VS Code indefinitely.
4. The report can be shared without absolute workspace paths.

## Future
Snail Investigation: reproducible A/B experiments, deep profiling and safe fixes with rollback.
Snail Watch: opt-in lightweight historical trends.
