const test = require('node:test');
const assert = require('node:assert/strict');
const { sampleCurrentProcess, createNodeProcessSampleSource, DEFAULT_PROCESS_SAMPLE_MS } =
  require('../../dist/core/index.js');

function sourceFor({ elapsedMs = 500, cpuUser = 200000, cpuSystem = 100000, rss = 157286400 } = {}) {
  let nanoseconds = 0n;
  let cpuCalls = 0;
  let sleepCalls = 0;
  return {
    source: {
      nowNs: () => nanoseconds,
      cpuUsage: (previous) => {
        cpuCalls++;
        return previous ? { user: cpuUser, system: cpuSystem } : { user: 0, system: 0 };
      },
      rssBytes: () => rss,
      sleep: async () => { sleepCalls++; nanoseconds = BigInt(elapsedMs) * 1000000n; }
    },
    calls: () => ({ cpuCalls, sleepCalls })
  };
}

test('CPU calculation uses user + system microseconds over monotonic wall time', async () => {
  const fake = sourceFor();
  const result = await sampleCurrentProcess(() => false, fake.source);
  assert.equal(result.cpuPercentOneCore, 60);
  assert.equal(result.rssMb, 150);
  assert.equal(result.samplingMs, 500);
  assert.match(result.scope, /NOT individual/);
  assert.match(result.scope, /excludes separate language-server processes/);
  assert.equal(fake.calls().cpuCalls, 2);
  assert.equal(fake.calls().sleepCalls, 10);
  assert.equal(DEFAULT_PROCESS_SAMPLE_MS, 500);
});

test('CPU > 100% is reported truthfully for multi-core/process threads', async () => {
  const result = await sampleCurrentProcess(() => false, sourceFor({ cpuUser: 750000, cpuSystem: 200000 }).source);
  assert.equal(result.cpuPercentOneCore, 190);
});

test('idle CPU and fractional memory measurements remain well defined', async () => {
  const result = await sampleCurrentProcess(() => false, sourceFor({ cpuUser: 0, cpuSystem: 0, rss: 1310720 }).source);
  assert.equal(result.cpuPercentOneCore, 0);
  assert.equal(result.rssMb, 1.3);
});

test('cancellation before starting performs no I/O', async () => {
  const fake = sourceFor();
  await assert.rejects(sampleCurrentProcess(() => true, fake.source), /cancelled/);
  assert.equal(fake.calls().cpuCalls, 0);
  assert.equal(fake.calls().sleepCalls, 0);
});

test('mid-sample cancellation avoids fetching or publishing partial counters', async () => {
  const fake = sourceFor();
  const result = await assert.rejects(sampleCurrentProcess(() => fake.calls().sleepCalls >= 1, fake.source), /cancelled/);
  assert.equal(fake.calls().sleepCalls, 1);
  assert.equal(fake.calls().cpuCalls, 1);
});

test('unsupported sampling intervals and invalid counters fail safely', async () => {
  const fake = sourceFor();
  await assert.rejects(sampleCurrentProcess(() => false, fake.source, -1), /Invalid process sampling duration/);
  await assert.rejects(sampleCurrentProcess(() => false, sourceFor({ elapsedMs: 0 }).source), /Invalid process sampling counters/);
  await assert.rejects(sampleCurrentProcess(() => false, sourceFor({ cpuUser: -1 }).source), /Invalid process sampling counters/);
  await assert.rejects(sampleCurrentProcess(() => false, sourceFor({ rss: -1 }).source), /Invalid process sampling counters/);
});

test('sample failure does not imply an extension is responsible', async () => {
  const fake = sourceFor();
  fake.source.cpuUsage = () => { throw new Error('/home/user/private-extension'); };
  await assert.rejects(sampleCurrentProcess(() => false, fake.source), /private-extension/);
  // Runner sanitizes this error into a collector failed status and a generic warning.
});

test('Node.js sampling source returns expected functions when running in Node', () => {
  const source = createNodeProcessSampleSource();
  assert.equal(typeof source.cpuUsage, 'function');
  assert.equal(typeof source.nowNs(), 'bigint');
  assert.ok(source.rssBytes() > 0);
});
