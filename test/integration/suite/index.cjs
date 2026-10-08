const assert = require('node:assert/strict');
const vscode = require('vscode');

async function run() {
  const extension = vscode.extensions.getExtension('zephfiro.snail-doctor');
  assert.ok(extension, 'Snail Doctor should be installed in Extension Development Host');
  await extension.activate();
  assert.equal(extension.isActive, true);

  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('snail.diagnose'), 'Diagnosis command is registered');
  assert.ok(commands.includes('snail.exportReport'), 'Report export command is registered');

  assert.ok(commands.includes('snail.investigateTypeScript'));
  assert.ok(commands.includes('snail.recordBaseline'));
  assert.ok(commands.includes('snail.recordComparison'));
  assert.ok(commands.includes('snail.clearExperimentData'));
  assert.ok(commands.includes('snail.startWatch'));
  assert.ok(commands.includes('snail.stopWatch'));
  assert.ok(commands.includes('snail.toggleWatch'));
  assert.ok(commands.includes('snail.openWatchSessions'));
  assert.ok(commands.includes('snail.exportWatchSession'));
  assert.ok(commands.includes('snail.clearWatchHistory'));
  await vscode.commands.executeCommand('snail.investigateTypeScript');
  await vscode.commands.executeCommand('snail.diagnose');

  // Verify persistence using the real VS Code filesystem provider in the
  // isolated Extension Development Host, not a mocked unit test.
  const { LocalWatchStorage } = require('../../../dist/watch/storage.js');
  const crypto = require('node:crypto');
  const os = require('node:os');
  const path = require('node:path');
  const dir = vscode.Uri.file(path.join(os.tmpdir(), 'snail-watch-integration-' + crypto.randomUUID()));
  const store = new LocalWatchStorage(dir);
  const stamp = new Date().toISOString();
  const id = crypto.randomUUID();
  const session = {
    schemaVersion: 1, id, instanceId: 'integration-test',
    state: 'completed', startedAt: stamp, endedAt: stamp, lastSavedAt: stamp,
    intervalMs: 5000, maxDurationMs: 30000,
    environment: { vscodeVersion: vscode.version, platform: process.platform, remote: false, scope: 'current-node-extension-host' },
    samples: [{ kind: 'measured', timestamp: stamp, elapsedMs: 5000, cpuPercentOneCore: 20, rssMiB: 140 }]
  };
  try {
    await store.save(session);
    const restored = await store.list();
    assert.ok(restored.some(s => s.id === id));
    assert.equal(restored.find(s => s.id === id).samples.length, 1);
    await store.delete(id);
    assert.equal((await store.list()).some(s => s.id === id), false);
  } finally {
    await vscode.workspace.fs.delete(dir, { recursive: true, useTrash: false });
  }
  // The result is a Webview panel. The public API cannot enumerate all Webviews,
  // but the command must complete without throwing under the real Extension Host.
}
module.exports = { run };
