const test = require('node:test');
const assert = require('node:assert/strict');
const { scanWorkspace } = require('../../dist/workspace-scan.js');
const {
  DiagnosticRunner, defineDiagnostic, createDefaultModules, createReport
} = require('../../dist/core/index.js');

const entry = (name, type = 'file') => ({
  name,
  isDirectory: () => type === 'dir',
  isSymbolicLink: () => type === 'link'
});
const context = (overrides = {}) => {
  let time = 0;
  return {
    cancellation: { isCancellationRequested: false },
    now: () => ++time,
    limits: { workspace: { maxEntries: 100, maxMs: 2000, maxDepth: 5 }, collectors: {} },
    services: {},
    ...overrides
  };
};
const moduleFor = (id, collect) => defineDiagnostic({ id, collect });

test('streaming stops after the entry budget without materializing a huge directory', async () => {
  let produced = 0;
  const report = await scanWorkspace('/fake', () => false, {
    maxEntries: 3,
    maxMs: 1000,
    now: () => 0,
    openDirectory: async () => ({
      async *[Symbol.asyncIterator]() {
        for (let i = 0; i < 100000; i++) {
          produced++;
          yield entry('item-' + i);
        }
      }
    })
  });
  assert.equal(report.entries, 3);
  assert.equal(report.limitReached, true);
  assert.deepEqual(report.limitReasons, ['entries']);
  assert.equal(report.scannedDirectories, 1);
  assert.ok(produced <= 4, 'no eager loading of remaining entries');
});

test('enforces depth limit and does not traverse symlinks', async () => {
  const visited = [];
  const report = await scanWorkspace('/root', () => false, {
    maxDepth: 0, now: () => 0, maxMs: 1000,
    openDirectory: async directory => {
      visited.push(directory);
      return {
        async *[Symbol.asyncIterator]() {
          yield entry('src', 'dir');
          yield entry('link', 'link');
          yield entry('node_modules', 'dir');
        }
      };
    }
  });
  assert.deepEqual(visited, ['/root']);
  assert.equal(report.depthLimitedDirectories, 1);
  assert.equal(report.skippedSymlinks, 1);
  assert.ok(report.candidates.includes('node_modules'));
  assert.deepEqual(report.limitReasons, ['depth']);
});

test('marks inaccessible directory as partial without exposing filesystem path', async () => {
  const report = await scanWorkspace('/secrets/internal', () => false, {
    now: () => 0,
    openDirectory: async () => { throw new Error('EACCES /secrets/internal'); }
  });
  assert.equal(report.skippedDirectories, 1);
  assert.equal(report.limitReached, true);
  assert.deepEqual(report.limitReasons, ['unreadable']);
  assert.doesNotMatch(JSON.stringify(report), /secrets/);
});

test('cooperative cancellation interrupts a streaming directory iteration', async () => {
  let cancelled = false;
  await assert.rejects(scanWorkspace('/fake', () => cancelled, {
    now: () => 0,
    openDirectory: async () => ({
      async *[Symbol.asyncIterator]() {
        yield entry('first');
        cancelled = true;
        yield entry('second');
      }
    })
  }), /cancelled/);
});

test('multiple roots share one global entry budget and skip virtual roots', async () => {
  const budgets = [];
  const services = {
    workspaceRoot: () => ({ scheme: 'file', fsPath: '/one' }),
    workspaceRoots: () => [
      { scheme: 'file', fsPath: '/one' },
      { scheme: 'custom', fsPath: '/virtual' },
      { scheme: 'file', fsPath: '/two' },
      { scheme: 'file', fsPath: '/three' }
    ],
    scanWorkspace: async (folder, _cancelled, options) => {
      budgets.push({ folder, maxEntries: options.maxEntries, maxMs: options.maxMs });
      const entries = folder === '/one' ? 3 : 2;
      return {
        entries, candidates: folder === '/one' ? ['node_modules'] : ['vendor'],
        skippedDirectories: 0, skippedSymlinks: 0, depthLimitedDirectories: 0,
        scannedDirectories: 1, limitReached: false, limitReasons: []
      };
    }
  };
  const modules = createDefaultModules().filter(m => m.id === 'workspace');
  const run = await new DiagnosticRunner(modules).run(context({
    services,
    limits: { workspace: { maxEntries: 5, maxDepth: 3, maxMs: 2000 }, collectors: { workspace: 2500 } }
  }));
  const report = createReport(run, { vscodeVersion: '1.94', platform: 'linux', remote: false }, '2026-10-08');
  assert.deepEqual(budgets.map(x => x.maxEntries), [5, 2]);
  assert.equal(report.summary.scannedEntries, 5);
  assert.equal(report.summary.limitReached, true);
  assert.match(report.warnings.join(' '), /virtual workspace folders were skipped/);
  assert.ok(run.evidence.get('workspace').scan.candidates.includes('vendor'));
});

test('virtual-only workspaces are reported as unsupported without attempting scans', async () => {
  const services = {
    workspaceRoot: () => ({ scheme: 'custom', fsPath: '/virtual' }),
    workspaceRoots: () => [{ scheme: 'custom', fsPath: '/virtual' }],
    scanWorkspace: async () => { throw Error('Must not scan virtual roots'); }
  };
  const run = await new DiagnosticRunner(createDefaultModules().filter(m => m.id === 'workspace'))
    .run(context({ services }));
  assert.equal(run.collectors[0].status, 'unavailable');
  assert.match(run.warnings[0], /No file-backed workspace folder/);
});

test('one timed-out collector does not delay independent collectors', async () => {
  let resolveLate;
  let cancelledInWork = false;
  const neverPrompt = new Promise(resolve => { resolveLate = resolve; });
  const runPromise = new DiagnosticRunner([
    moduleFor('stuck', async ctx => {
      await neverPrompt;
      cancelledInWork = ctx.cancellation.isCancellationRequested;
      return { data: { privateData: 'DO NOT PUBLISH' } };
    }),
    moduleFor('working', async () => ({ data: 'fine' }))
  ]).run(context({
    scheduleTimeout: (_ms, cb) => {
      if (_ms === 25) queueMicrotask(cb);
      return () => {};
    },
    limits: { workspace: {}, collectors: { stuck: 25, working: 100 } }
  }));
  const result = await runPromise;
  assert.deepEqual(result.collectors.map(x => x.status), ['timed_out', 'collected']);
  assert.equal(result.evidence.get('stuck'), undefined);
  assert.equal(result.evidence.get('working'), 'fine');
  assert.match(result.warnings.join(' '), /stuck exceeded its 25ms budget/);
  resolveLate();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelledInWork, true);
  assert.equal(result.evidence.get('stuck'), undefined);
});

test('cancellation event interrupts an unresponsive collector promptly', async () => {
  let cancelled = false;
  let listener;
  let disposed = false;
  const token = {
    get isCancellationRequested() { return cancelled; },
    onCancellationRequested(callback) {
      listener = callback;
      return { dispose() { disposed = true; } };
    }
  };
  const runner = new DiagnosticRunner([
    moduleFor('slow', async () => new Promise(() => {})),
    moduleFor('next', async () => ({ data: 2 }))
  ]);
  const pending = runner.run(context({
    cancellation: token,
    limits: { workspace: {}, collectors: { slow: 5000, next: 5000 } }
  }));
  await new Promise(resolve => setImmediate(resolve));
  cancelled = true;
  listener();
  const result = await pending;
  assert.deepEqual(result.collectors.map(x => x.status), ['skipped', 'skipped']);
  assert.equal(disposed, true);
  assert.match(result.warnings.join(' '), /cancelled/);
});

test('deadline records missing workspace evidence as partial rather than complete', async () => {
  const run = await new DiagnosticRunner([
    moduleFor('workspace', async () => new Promise(() => {})),
    moduleFor('extensions', async () => ({ data: { installedExtensions: 1, activeExtensions: 1 } }))
  ]).run(context({
    scheduleTimeout: (_ms, cb) => { queueMicrotask(cb); return () => {}; },
    limits: { workspace: {}, collectors: { workspace: 1, extensions: 1 } }
  }));
  const report = createReport(run, { vscodeVersion: '1.94', platform: 'linux', remote: false }, '2026-10-08');
  assert.equal(report.summary.limitReached, true);
  assert.equal(report.summary.scannedEntries, 0);
  assert.equal(report.collectors[0].status, 'timed_out');
});
