const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DiagnosticRunner, defineDiagnostic, CollectionUnavailable,
  createDefaultModules, createReport,
  extensionsAnalyzer, processAnalyzer, workspaceAnalyzer
} = require('../../dist/core/index.js');

function context(overrides = {}) {
  let time = 0;
  return {
    cancellation: { isCancellationRequested: false },
    now: () => ++time,
    limits: { workspace: { maxEntries: 100, maxDepth: 3, maxMs: 250 } },
    services: {},
    ...overrides
  };
}
const item = (id, collect, analyze) => defineDiagnostic({ id, collect }, analyze && { analyze });
const environment = { vscodeVersion: '1.94.0', platform: 'linux', remote: false };

test('runner aggregates independent evidence and annotates finding source', async () => {
  const runner = new DiagnosticRunner([
    item('first', async () => ({ data: { amount: 3 } }), data => [{
      id: 'first-finding', title: 'Sample', category: 'extensions', severity: 'info',
      confidence: 'measured', evidence: String(data.amount), recommendation: 'Inspect'
    }]),
    item('second', async () => ({ data: { other: true } }))
  ]);
  const result = await runner.run(context());
  assert.deepEqual(result.findings[0].sources, ['first']);
  assert.equal(result.evidence.get('first').amount, 3);
  assert.equal(result.evidence.get('second').other, true);
  assert.deepEqual(result.collectors.map(c => c.status), ['collected', 'collected']);
  assert.ok(result.collectors.every(c => c.durationMs >= 0));
  assert.equal(result.warnings.length, 0);
});

test('one collector failure does not stop other collectors or analyzers', async () => {
  const runner = new DiagnosticRunner([
    item('broken', async () => { throw new Error('/home/alice/private/.env SECRET=abc'); }),
    item('ok', async () => ({ data: 7 }), data => [{
      id: 'ok', title: 'Healthy', category: 'process', severity: 'info',
      confidence: 'informational', evidence: String(data), recommendation: 'None'
    }])
  ]);
  const result = await runner.run(context());
  assert.deepEqual(result.collectors.map(c => c.status), ['failed', 'collected']);
  assert.deepEqual(result.findings.map(f => f.id), ['ok']);
  assert.match(result.warnings.join(' '), /Collector broken failed/);
  assert.doesNotMatch(result.warnings.join(' '), /private|SECRET|alice/);
});

test('expected environment limitations appear as unavailable, not broken', async () => {
  const runner = new DiagnosticRunner([
    item('virtual', async () => { throw new CollectionUnavailable('Local folders are unavailable.'); }),
    item('next', async () => ({ data: true }))
  ]);
  const result = await runner.run(context());
  assert.deepEqual(result.collectors.map(c => c.status), ['unavailable', 'collected']);
  assert.deepEqual(result.warnings, ['Local folders are unavailable.']);
});

test('analyzer failure leaves other findings intact', async () => {
  const runner = new DiagnosticRunner([
    item('bad-analyzer', async () => ({ data: true }), () => { throw new Error('broken'); }),
    item('valid-analyzer', async () => ({ data: true }), () => [{
      id: 'valid', title: 'Valid', category: 'workspace', severity: 'info',
      confidence: 'informational', evidence: 'yes', recommendation: 'nothing'
    }])
  ]);
  const result = await runner.run(context());
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].id, 'valid');
  assert.ok(result.warnings.some(warning => warning.includes('Analyzer bad-analyzer failed')));
});

test('cancellation skips remaining collectors without invoking their work', async () => {
  const signal = { isCancellationRequested: false };
  let calls = 0;
  const runner = new DiagnosticRunner([
    item('first', async () => { signal.isCancellationRequested = true; return { data: 2 }; }),
    item('second', async () => { calls++; return { data: 3 }; })
  ]);
  const result = await runner.run(context({ cancellation: signal }));
  assert.equal(calls, 0);
  assert.deepEqual(result.collectors.map(c => c.status), ['skipped', 'skipped']);
  assert.ok(result.warnings.some(w => w.includes('cancelled')));
});

test('duplicate or empty collector identifiers are rejected', () => {
  assert.throws(() => new DiagnosticRunner([item('same', async () => ({ data: 1 })), item('same', async () => ({ data: 2 }))]), /unique/);
  assert.throws(() => new DiagnosticRunner([item('', async () => ({ data: 1 }))]), /unique/);
});

test('analyzers use evidence fixtures and never receive I/O services', () => {
  const ext = extensionsAnalyzer.analyze({ installedExtensions: 4, activeExtensions: 1 });
  assert.equal(ext[0].confidence, 'informational');
  assert.match(ext[0].evidence, /4 non-built-in/);
  const lowCpu = { cpuPercentOneCore: 22, rssMb: 120, samplingMs: 500, scope: 'host' };
  assert.deepEqual(processAnalyzer.analyze(lowCpu), []);
  const highCpu = processAnalyzer.analyze({ ...lowCpu, cpuPercentOneCore: 80 });
  assert.equal(highCpu[0].confidence, 'measured');
  assert.match(highCpu[0].evidence, /cannot identify a specific extension/);

  const workspace = { scan: { entries: 3, candidates: ['node_modules'], limitReached: false, skippedDirectories: 0 } };
  const empty = { get: () => undefined };
  assert.deepEqual(workspaceAnalyzer.analyze(workspace, empty), []);
  const settings = { get: id => id === 'settings' ? { watcherExclude: {} } : undefined };
  const findings = workspaceAnalyzer.analyze(workspace, settings);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].confidence, 'inferred');
  assert.deepEqual(findings[0].sources, ['workspace', 'settings']);
  const excluded = { get: id => id === 'settings' ? { watcherExclude: { '**/node_modules/**': true } } : undefined };
  assert.deepEqual(workspaceAnalyzer.analyze(workspace, excluded), []);
});

test('default modules are registered without runner special cases', async () => {
  const modules = createDefaultModules();
  assert.deepEqual(modules.map(module => module.id), ['extensions', 'process', 'workspace', 'settings']);
  const ctx = context({
    services: {
      listExtensions: () => [{ id: 'publisher.first', isActive: true }, { id: 'publisher.second', isActive: false }],
      workspaceRoot: () => ({ scheme: 'file', fsPath: '/somewhere' }),
      watcherExclude: () => ({}),
      sampleProcess: async () => ({ cpuPercentOneCore: 71, rssMb: 100, samplingMs: 500, scope: 'host' }),
      scanWorkspace: async () => ({
        entries: 12, candidates: ['node_modules'], limitReached: false, skippedDirectories: 1
      })
    }
  });
  const result = await new DiagnosticRunner(modules).run(ctx);
  assert.equal(result.collectors.length, 4);
  assert.ok(result.findings.some(f => f.id === 'extension-inventory'));
  assert.ok(result.findings.some(f => f.id === 'extension-host-cpu'));
  assert.ok(result.findings.some(f => f.id === 'workspace-generated-dirs'));
  assert.ok(result.warnings.some(w => w.includes('Could not read 1 directories')));
  const report = createReport(result, environment, '2026-10-08T12:00:00Z');
  assert.equal(report.summary.installedExtensions, 2);
  assert.equal(report.summary.scannedEntries, 12);
  assert.equal(report.collectors.length, 4);
  assert.equal(report.schemaVersion, 1);
});

test('report preserves partial successes when a collector is unavailable', async () => {
  const result = await new DiagnosticRunner([
    item('extensions', async () => ({ data: { installedExtensions: 3, activeExtensions: 2 } })),
    item('process', async () => { throw new Error('not supported'); }),
    item('workspace', async () => ({ data: { scan: { entries: 7, limitReached: true } } }))
  ]).run(context());
  const report = createReport(result, environment, '2026-10-08T12:00:00Z');
  assert.equal(report.summary.installedExtensions, 3);
  assert.equal(report.summary.scannedEntries, 7);
  assert.equal(report.summary.limitReached, true);
  assert.equal(report.process, undefined);
  assert.equal(report.collectors.find(c => c.id === 'process').status, 'failed');
});
