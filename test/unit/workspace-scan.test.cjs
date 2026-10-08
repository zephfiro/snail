const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { scanWorkspace } = require('../../dist/workspace-scan.js');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'snail-doctor-test-'));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('scans directory names without descending into generated folders', async t => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'node_modules'));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(path.join(root, 'node_modules', 'ignored.txt'), 'ignore me');
  await fs.writeFile(path.join(root, 'src', 'entry.ts'), 'contents must not be read');
  const report = await scanWorkspace(root, () => false);
  assert.deepEqual(report.candidates, ['node_modules']);
  assert.equal(report.entries, 4);
  assert.equal(report.limitReached, false);
  assert.equal(report.skippedDirectories, 0);
});

test('stops at a configured entry limit and marks results partial', async t => {
  const root = await fixture(t);
  for (let i = 0; i < 12; i++) await fs.writeFile(path.join(root, 'file-' + i), '');
  const report = await scanWorkspace(root, () => false, { maxEntries: 3 });
  assert.equal(report.entries, 3);
  assert.equal(report.limitReached, true);
});

test('stops at configured time limit and marks results partial', async t => {
  const root = await fixture(t);
  let now = 100;
  const result = await scanWorkspace(root, () => false, { maxMs: 2, now: () => ++now });
  assert.equal(result.limitReached, true);
});

test('aborts when cancelled', async t => {
  const root = await fixture(t);
  await assert.rejects(scanWorkspace(root, () => true), /cancelled/);
});

test('records unreadable roots as partial scan instead of throwing', async t => {
  const root = await fixture(t);
  const missing = path.join(root, 'deleted');
  const result = await scanWorkspace(missing, () => false);
  assert.equal(result.entries, 0);
  assert.equal(result.skippedDirectories, 1);
});

test('does not follow directory symlinks', async t => {
  const root = await fixture(t);
  const target = path.join(root, 'target');
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, 'one'), '');
  try {
    await fs.symlink(target, path.join(root, 'link'), 'dir');
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES') return t.skip('symlinks unavailable');
    throw error;
  }
  const result = await scanWorkspace(root, () => false);
  assert.equal(result.entries, 3);
});
