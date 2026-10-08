# Snail Watch — v0.4 session-based passive monitoring

Snail Watch is **opt-in**. It collects aggregate Node Extension Host process CPU and RSS only after an explicit **Start Watch** command. It does not profile individual extensions or TypeScript Language Servers.

## Usage

1. Click **Snail Watch: OFF** in the VS Code Status Bar, or run **Snail: Start Watch**.
2. Choose **Until I stop** (with a 2-hour safety cap), **15**, **30** or **60 minutes**.
3. Continue working in VS Code; the Status Bar shows **Watch: ON** and session duration. No changes are made to your extensions, settings or code.
4. Click **Watch: ON** or run **Snail: Stop Watch**. Recording stops, the timer is disposed, and the session is saved.
5. Choose **Analyze now** or use **Snail: Open Watch Sessions** at any time, even after restarting VS Code.
6. Optionally run **Snail: Export Watch Session** to export selected numeric data, or **Snail: Clear Watch History** to remove all saved sessions.

## What Watch measures

- CPU consumed by the **current Node Extension Host process**, normalized to **one CPU core**. Values above 100% are possible.
- Resident set size (RSS) of the same process in MiB.
- Actual elapsed time between consecutive samples (5s nominal cadence), timestamp and gaps.

**Not measured:** CPU/RAM attributed to a named VS Code extension, Electron renderer processes, standalone tsserver language servers, other extension hosts, OS-wide resource use or heap objects owned by an extension.

A slow/delayed timer interval is stored as an explicit **gap**, rather than a fabricated CPU value. Watch does not read workspace files, run shell commands, perform heap snapshots or transmit telemetry. The watch sampler uses process CPU counters, monotonic time and RSS, with no deep profiler.

## Importing extension-associated CPU evidence (opt-in)

Use **Snail: Import CPU Profile for Watch Session** to select an existing, *locally acquired* V8 `.cpuprofile` file. VS Code's **Developer: Show Running Extensions** includes profiling facilities; capture the profile through the supported VS Code UI, then import the file with user consent.

Snail parses V8 `nodes`, `samples`, and `timeDeltas`, and attempts to associate sampled call stacks with the verified roots of **currently installed extensions in this Extension Host environment**. If a stack cannot be associated with a known extension, it stays **unknown**. Profiles captured on another machine, host, workspace or after an extension update may not match paths; this correctly results in no individual series.

The line labeled **CPU profile sample-share** represents *the percentage of sampled stack occurrences attributed to an extension in 500ms profile-relative buckets*. It is **not** a measured percentage of one CPU core, absolute CPU time, or a full Watch session timeline. Profile time zero and Watch time zero are unrelated; their plots have independent scales. A short profile cannot prove a session-long CPU ranking.

Security boundaries: import is manual and local; max file size **8 MiB**, duration **5 minutes**, at most **200k samples**, **100k nodes**, **600 buckets**, and **80 attributed extensions**. The raw profile (including function names, stack URLs and paths) is **never stored** or exported; the session stores only bounded extension IDs, aggregate sample counts, and bucket shares. Session metadata is private local storage and should not be shared blindly. The original profile remains where the user saved it.

A separate `MemoryAttribution` contract accepts memory only when an adapter has independently verified **exclusive ownership of a dedicated OS process** by one extension, with process identity and real RSS measurements. The public VS Code API does **not** currently provide such an adapter, so RAM by extension is correctly displayed as **N/A**, even when icon/name metadata is available. A configured process shared by two extensions is not attributable.

Profiles do **not** contain extension-specific RSS/heap ownership. Consequently the RAM chart will continue to show host RSS and mark extension RAM **unavailable** until a genuinely attributable source can be implemented.

## Lifetime and limits

- **OFF by default**, even after reload. VS Code may activate Snail on startup to display the OFF indicator, but this does not activate polling.
- Only one recording in each extension instance, with separate random session IDs for different VS Code windows/hosts.
- 5s sampling; max 2h per session or 1,440 samples, whichever comes first.
- In-memory samples are bounded. The session is checkpointed every 6 samples (approximately 30s), and again when stopped.
- If VS Code closes unexpectedly, the last checkpoint may not contain up to five final samples. No collection restarts automatically. Old session records marked recording are shown as possibly interrupted, with timestamp-based uncertainty.
- Up to 20 recently finished sessions retained per installation, with an age limit of 30 days. Storage quota/pruning and storage failures are explicit; some potentially stale files from parallel windows may persist until pruned.
- Local files are stored in the extension-owned `globalStorageUri/watch-v1` directory. No raw workspace paths, extension IDs, logs or source text are included.

## Reviewing the session

`Snail: Open Watch Sessions` lists the recordings. The offline report shows CPU/RSS charts, mean/p95 CPU, peak RSS, start/end RSS, delta, missing intervals, sustained CPU episodes and *possible* memory growth.

**None of these prove a specific extension is guilty.** A snapshot of high Extension Host CPU is host-level evidence; growing process RSS is not proof of a leak. Use Snail Doctor investigation and controlled before/after experiments to test candidate causes.

Raw session export is a manual, privacy-limited JSON containing timestamps and numeric samples. Timing metadata itself can be sensitive; inspect files before sharing.

## Test commands

```bash
npm run build
npm run lint
npm run test:unit
npm run test:integration
npm run package
```

Unit tests exercise timers, states, data limits, gaps, analytics and rendering. CI also verifies that the VSIX installs and runs in an isolated VS Code environment. Real-workspace acceptance should additionally measure Watch overhead under idle and active workloads before Marketplace publication.
