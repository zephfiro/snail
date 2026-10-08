# Contributing

Use Node.js 22+ and npm.

1. Install dependencies: `npm install`.
2. Build: `npm run build`.
3. Typecheck: `npm run lint`.
4. Run unit tests: `npm test`.
5. Run Extension Host integration: `npm run test:integration` (or `xvfb-run -a npm run test:integration` on headless Linux).
6. Open VS Code and press F5 to launch the Extension Development Host.
7. Run `Snail: Diagnose Performance`.

Do not add unbounded recursive scans, background telemetry, automatic config edits, or misleading per-extension performance metrics. Document how new evidence is measured, its scope, and limitations.

CI runs unit and Extension Host integration tests on pull requests. Tests should cover observable behavior rather than matching source code text where practical.
