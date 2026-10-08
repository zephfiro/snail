const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('package declares diagnosis and export commands', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.ok(manifest.contributes.commands.some(x => x.command === 'snail.diagnose'));
  assert.ok(manifest.contributes.commands.some(x => x.command === 'snail.exportReport'));
  assert.equal(manifest.main, './dist/extension.js');
});
test('bundled extension registers both commands', () => {
  const bundle = fs.readFileSync(path.join(root, 'dist/extension.js'), 'utf8');
  assert.match(bundle, /snail\.diagnose/);
  assert.match(bundle, /snail\.exportReport/);
});
test('bundled extension does not enable Webview scripts', () => {
  const source = fs.readFileSync(path.join(root, 'src/extension.ts'), 'utf8');
  assert.match(source, /enableScripts:\s*false/);
});
