const test = require('node:test');
const assert = require('node:assert/strict');
const { DiagnosticRunner, defineDiagnostic, createReport } = require('../../dist/core/index.js');
const createModule=(id,data)=>defineDiagnostic({id,collect:async()=>({data})});

test('runner records on-demand elapsed duration without a persistent monitor',async()=>{
  let clock=0;
  const run=await new DiagnosticRunner([
    createModule('extensions',{installedExtensions:1,activeExtensions:1}),
    createModule('other',42)
  ]).run({
    cancellation:{isCancellationRequested:false},
    now:()=>++clock,
    limits:{workspace:{},totalMs:6500},services:{}
  });
  assert.ok(run.durationMs>0);
  assert.equal(run.budgetExceeded,false);
  const report=createReport(run,{vscodeVersion:'1.94',platform:'linux',remote:false},'2026-10-08');
  assert.equal(report.durationMs,run.durationMs);
  assert.equal(report.budgetExceeded,false);
});

test('total budget suppresses remaining work and marks the report as partial',async()=>{
  let clock=0,called=false;
  const run=await new DiagnosticRunner([createModule('extensions',{installedExtensions:1,activeExtensions:0}),{
    id:'workspace',async collect(){called=true;return {data:{}};}
  }]).run({
    cancellation:{isCancellationRequested:false},
    now:()=>{clock+=1000;return clock;},
    limits:{workspace:{},totalMs:500},services:{}
  });
  assert.equal(called,false);
  assert.equal(run.budgetExceeded,true);
  assert.ok(run.collectors.every(x=>x.status==='skipped'));
  assert.match(run.warnings.join(' '),/budget reached/);
});
