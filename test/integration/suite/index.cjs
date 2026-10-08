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

  await vscode.commands.executeCommand('snail.diagnose');
  // The result is a Webview panel. The public API cannot enumerate all Webviews,
  // but the command must complete without throwing under the real Extension Host.
}
module.exports = { run };
