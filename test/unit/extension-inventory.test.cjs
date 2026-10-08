const test = require('node:test');
const assert = require('node:assert/strict');
const {
  collectExtensionInventory, extensionsCollector, extensionsAnalyzer,
  DiagnosticRunner, createDefaultModules, createReport
} = require('../../dist/core/index.js');
const { createShareableReport } = require('../../dist/report-export.js');

function fixture(extensions) {
  return {
    cancellation: { isCancellationRequested: false },
    now: () => 100,
    limits: { workspace: { maxEntries: 5 } },
    services: { listExtensions: () => extensions }
  };
}
test('empty extensions list produces an empty inventory', async () => {
  const result = await extensionsCollector.collect(fixture([]));
  assert.deepEqual(result.data, {
    installedExtensions: 0, activeExtensions: 0, builtinExtensions: 0, entries: []
  });
  assert.equal(result.warnings, undefined);
});

test('normalizes metadata without calling any extension activation hook', async () => {
  let activationCalls = 0;
  const raw = [
    { id: 'ms-python.python', displayName: 'Python', version: '2026.1', isActive: true, isBuiltin: false, extensionKind: 2,
      activate() { activationCalls++; throw Error('Never activate'); } },
    { id: 'private.acme', displayName: 'Internal tool', version: '0.2.0', isActive: false, extensionKind: 1 },
    { id: 'vscode.git', displayName: 'Git', version: '1.0', isActive: true, extensionKind: 1 },
    { id: 'other.extension', displayName: 7, version: 42, isActive: undefined, extensionKind: 99, isBuiltin: true }
  ];
  const result = await extensionsCollector.collect(fixture(raw));
  assert.equal(activationCalls, 0);
  assert.equal(result.data.installedExtensions, 2);
  assert.equal(result.data.activeExtensions, 1);
  assert.equal(result.data.builtinExtensions, 2);
  assert.deepEqual(result.data.entries.map(x => x.id), [
    'ms-python.python', 'private.acme', 'other.extension', 'vscode.git'
  ]);
  assert.equal(result.data.entries[0].extensionKind, 'workspace');
  assert.equal(result.data.entries[1].extensionKind, 'ui');
  assert.equal(result.data.entries[2].extensionKind, 'unknown');
  assert.equal(result.data.entries[2].displayName, 'other.extension');
  assert.equal(result.data.entries[2].version, undefined);
  assert.equal(result.data.entries[1].isActive, false);
  assert.ok(result.data.entries.every(entry => typeof entry.id === 'string'));
});

test('skips missing or duplicate IDs without failing collection', async () => {
  const result = await extensionsCollector.collect(fixture([
    { id: 'Publisher.One', isActive: true, version: '' },
    { id: 'publisher.one', isActive: false },
    { id: null, isActive: true },
    { id: '   ', isActive: true },
    { id: 'a.valid', isActive: false }
  ]));
  assert.equal(result.data.installedExtensions, 2);
  assert.equal(result.data.activeExtensions, 1);
  assert.match(result.warnings.join(' '), /skipped 3/);
});

test('collectExtensionInventory does not mutate the source snapshot', () => {
  const raw = Object.freeze([Object.freeze({ id: 'some.extension', isActive: true })]);
  const result = collectExtensionInventory(raw);
  assert.equal(result.evidence.entries[0].id, 'some.extension');
  assert.equal(raw[0].isActive, true);
});

test('report exposes local inventory while export excludes names, IDs and versions', async () => {
  const privateId = 'internal.company-secrets';
  const secretName = 'Private <ACME> Extension';
  const runner = new DiagnosticRunner(createDefaultModules().filter(x => x.id === 'extensions'));
  const run = await runner.run(fixture([
    { id: privateId, displayName: secretName, version: 'secret-branch.25', isActive: true }
  ]));
  const report = createReport(run, { vscodeVersion: '1.94.0', platform: 'linux', remote: false }, '2026-10-08T12:00:00Z');
  assert.equal(report.extensionInventory[0].id, privateId);
  assert.equal(report.findings[0].confidence, 'informational');
  const shareable = createShareableReport(report);
  const json = JSON.stringify(shareable);
  assert.ok(!Object.hasOwn(shareable, 'extensionInventory'));
  assert.doesNotMatch(json, /internal\.company-secrets|Private <ACME>|secret-branch/);
  assert.equal(shareable.summary.activeExtensions, 1);
});

test('newly added or removed entries affect only the next explicit snapshot', async () => {
  const entries = [{ id: 'publisher.one', isActive: false }];
  const first = await extensionsCollector.collect(fixture(entries));
  entries.push({ id: 'publisher.two', isActive: true });
  const second = await extensionsCollector.collect(fixture(entries));
  assert.equal(first.data.entries.length, 1);
  assert.equal(second.data.entries.length, 2);
  assert.equal(first.data.activeExtensions, 0);
  assert.equal(second.data.activeExtensions, 1);
  assert.equal(extensionsAnalyzer.analyze(second.data)[0].confidence, 'informational');
});
