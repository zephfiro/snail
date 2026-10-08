# Villains Explorer (Watch v0.5)

## Using it

1. In VS Code, run **Snail: Start Watch**, work normally, then **Snail: Stop Watch**.
2. Open **Snail: Open Watch Sessions** and choose a completed session. The new **Villains Explorer** shows separate CPU and RAM timelines.
3. For named extension CPU evidence, capture a CPU profile through a **supported native VS Code profiling workflow**, save the V8 `.cpuprofile` file locally, and run **Snail: Import CPU Profile for Watch Session**. Select the session and profile, then reopen the Explorer.
4. Use **Top 5 / Top 10 / All**, search, clickable colored legend, sortable leaderboard and **Only evidence-backed** to focus on interesting series.
5. Use **Investigate** on an extension highlight to open a guided, reversible experiment. The extension is **never disabled automatically**.

### Understanding the scales

The CPU plot shows two **independent panels** when a profile is attached:
- **Extension Host CPU** measured by Snail, in percent **of one full CPU core**.
- **Extension-attributed V8 CPU samples** from an explicitly imported profiler file, in **percent of all stack samples in each 500ms profile bucket**. This is a relative *sample share*, not a percent of CPU core, and may include unknown samples.

They have **different time origins**. A profile captured after the Watch session **cannot be time-aligned** with the earlier session or used to prove that a particular extension caused its measured CPU peaks.

The RAM plot shows **RSS of the shared Node Extension Host**, in MiB. The extension cards display **RAM N/A** unless there is independent evidence of memory from a dedicated, exclusively owned process. The standard VS Code public API does not provide that information, and Snail does not distribute shared RSS among active extensions.

### Highlight methodology

- **Highest avg CPU share:** recognized samples from an extension / **all** samples (not a process CPU usage percentage).
- **Highest CPU spike:** highest profile-bin sample share, excluding buckets with fewer than three samples.
- **Most high-share buckets:** number of profile buckets containing at least 20% associated samples; not measured sustained CPU seconds.
- **Investigate first:** a *candidate for further investigation*, never a confirmed cause. Only available with >=20 samples, >=50% recognition coverage and a meaningful average share.
- **Highest RAM** and **Fastest RAM growth:** N/A unless verified dedicated-process readings exist.
- **No data** remains N/A. The dashboard must never render demo values as measurements.

### Security, performance and limitations

Icons are locally loaded only for PNG/JPEG/WebP image manifests within the verified extension root, up to 64 KiB each, maximum 40 icon reads. No external CDN, telemetry, shell profiling or private VS Code APIs. Raw CPU profiles, source URLs, stack/function names and filesystem paths are **never stored or exported**.

The import is opt-in and capped to 8 MiB, 5 minutes, 200k samples, 100k nodes and 600 time buckets. Session metadata stores known extension IDs with sampled counts, which remain local and are not included in the privacy-limited JSON export. Existing Watch v0.4 sessions open without profiles and display aggregate host lines only.

The SVG Webview uses a random CSP nonce, locally generated sanitized data and no external dependencies. It renders bounded profile series and retains gaps rather than interpolating missing values.

### Verification status

Implementation CI includes esbuild, TypeScript, Node unit tests, VS Code Extension Host integration, synthetic benchmark, VSIX packaging and isolated installation. Browser-script compilation and stress/legacy regression tests were added in #42.

A **manual** run inside a real multi-extension/large-workspace user environment remains required in [#30](https://github.com/zephfiro/snail/issues/30) before Marketplace publication. This is not automatically complete after CI passes.
