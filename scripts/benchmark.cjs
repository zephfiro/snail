const { performance } = require('node:perf_hooks');
const { scanWorkspace } = require('../dist/workspace-scan.js');
const { DiagnosticRunner, defineDiagnostic } = require('../dist/core/index.js');

async function main() {
  const samples = [];
  for (let round = 0; round < 3; round++) {
    const started = performance.now();
    let yielded = 0;
    const report = await scanWorkspace('/synthetic/monorepo', () => false, {
      maxEntries: 2500, maxDepth: 5, maxMs: 2000,
      openDirectory: async () => ({
        async *[Symbol.asyncIterator]() {
          for (let i = 0; i < 100000; i++) {
            yielded++;
            yield {
              name: 'file-' + i,
              isDirectory: () => false,
              isSymbolicLink: () => false
            };
          }
        }
      })
    });
    const elapsed = performance.now() - started;
    if (report.entries > 2500 || yielded > 2501 || !report.limitReached) {
      throw new Error('Streaming scan broke entry or partial-result bound');
    }
    samples.push({ elapsedMs: Math.round(elapsed * 10) / 10, processed:report.entries, produced:yielded });
  }

  const start = performance.now();
  const modules = [
    defineDiagnostic({id:'first',collect:async()=>({data:1})}),
    defineDiagnostic({id:'second',collect:async()=>({data:2})})
  ];
  const run = await new DiagnosticRunner(modules).run({
    cancellation:{isCancellationRequested:false},
    now:()=>performance.now(),
    limits:{workspace:{},totalMs:6500},
    services:{}
  });
  if (run.collectors.length!==2 || run.budgetExceeded) throw new Error('Unexpected runner benchmark result');
  console.log(JSON.stringify({
    benchmark:'snail-on-demand-synthetic-v1',
    environment:{node:process.version,platform:process.platform},
    workspaceSamples:samples,
    runnerMs:Math.round((performance.now()-start)*10)/10,
    disclaimer:'Synthetic, non-I/O benchmark only; not a production performance guarantee'
  },null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
