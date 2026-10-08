# Contributing

Use Node.js 22+ and npm.

1. Install dependencies: `npm install`.
2. Build: `npm run build`.
3. Typecheck: `npm run lint`.
4. Open VS Code and press F5 to launch the Extension Development Host.
5. Run `Snail: Diagnose Performance`.

Do not add unbounded recursive scans, background telemetry, automatic config edits, or misleading per-extension performance metrics. Document how new evidence is measured, its scope, and limitations.

Tests are an early roadmap item; `npm test` will become meaningful with the initial test suite.
