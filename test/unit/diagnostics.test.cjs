const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

// VS Code's API exists only inside the Extension Host; inject a tiny test double
// before loading the Node-compatible diagnostics bundle.
const fakeVscode = {
  version: '1.94.0',
  extensions: { all: [
    { id: 'vscode.builtin', isActive: true },
    { id: 'publisher.one', isActive: true },
    { id: 'publisher.two', isActive: false }
  ] },
  env: { remoteName: undefined },
  workspace: {
    workspaceFolders: undefined,
    getConfiguration: () => ({ get: () => ({}) })
  }
};
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return fakeVscode;
  return originalLoad.call(this, request, parent, isMain);
};
let diagnose;
try { ({ diagnose } = require('../../dist/diagnostics.js')); }
finally { Module._load = originalLoad; }

test('reports extension inventory without attributing individual CPU or RAM', async () => {
  fakeVscode.workspace.workspaceFolders = undefined;
  const report = await diagnose({ isCancellationRequested: false });
  assert.equal(report.summary.installedExtensions, 2);
  assert.equal(report.summary.activeExtensions, 1);
  assert.equal(report.environment.remote, false);
  assert.ok(report.findings.some(item => item.id === 'extension-inventory' && item.confidence === 'informational'));
  assert.ok(report.process && report.process.scope.includes('NOT individual'));
  assert.ok(report.warnings.some(warning => warning.includes('No local workspace')));
});

test('one collection failure preserves the remaining diagnostics', async t => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'snail-diagnostic-test-'));
  t.after(async () => fs.rm(folder, { recursive: true, force: true }));
  await fs.mkdir(path.join(folder, 'node_modules'));
  fakeVscode.workspace.workspaceFolders = [{ uri: { scheme: 'file', fsPath: folder } }];
  fakeVscode.workspace.getConfiguration = () => { throw new Error('configuration unavailable'); };
  try {
    const report = await diagnose({ isCancellationRequested: false });
    assert.ok(report.findings.some(item => item.id === 'extension-inventory'));
    assert.ok(report.warnings.some(item => item.includes('Collector settings failed')));
    assert.ok(report.collectors.some(item => item.id === 'workspace' && item.status === 'collected'));
    assert.ok(report.collectors.some(item => item.id === 'settings' && item.status === 'failed'));
    assert.equal(report.findings.some(item => item.id === 'workspace-generated-dirs'), false);
    assert.equal(report.summary.installedExtensions, 2);
  } finally {
    fakeVscode.workspace.workspaceFolders = undefined;
    fakeVscode.workspace.getConfiguration = () => ({ get: () => ({}) });
  }
});
