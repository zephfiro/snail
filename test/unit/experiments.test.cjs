const test=require('node:test'),assert=require('node:assert/strict');
const {median,compareTrial,evaluateExperiment}=require('../../dist/doctor/index.js');
const env={vscodeVersion:'1.94.0',remote:false,workspaceFolderCount:1};
const sample=(numbers,other={})=>({schemaVersion:1,subject:'typescript_language_server',operation:'autocomplete',
 timestamp:'2026-10-08T15:00:00Z',environment:env,source:'manual_observation',measurementsMs:numbers,...other});
const trial=(before=[200,210,190],after=[80,90,100],more={})=>({
 baseline:sample(before),comparison:sample(after),singleChange:true,reverted:false,...more
});
test('median ignores outlier ordering and supports even counts',()=>{
  assert.equal(median([10,90,11]),11);assert.equal(median([10,12,14,16]),13);
});
test('one A/B trial indicates suspected, not verified cause',()=>{
  const result=evaluateExperiment([trial()]);assert.equal(result.status,'suspected');
  assert.equal(result.trialResults[0].baselineMedianMs,200);
  assert.equal(result.trialResults[0].comparisonMedianMs,90);
  assert.equal(result.trialResults[0].changePercent,-55);
});
test('repeated manual reversible improvement is likely, never verified',()=>{
  const result=evaluateExperiment([trial(undefined,undefined,{reverted:true}),trial([190,200,210],[90,95,100],{reverted:true})]);
  assert.equal(result.status,'likely');
  assert.match(result.explanation,/Manual|manual|self-reported/);
});
test('repeated instrumented controlled comparisons can be verified',()=>{
  const instrumented=t=>({...t,baseline:sample([200,210,190],{source:'measured_by_snail'}),
    comparison:sample([80,90,100],{source:'measured_by_snail'}),reverted:true});
  assert.equal(evaluateExperiment([instrumented(trial()),instrumented(trial())]).status,'verified_by_experiment');
});
test('incompatible operations, environment and source are not comparable',()=>{
  const t=trial();t.comparison=sample([60,80,100],{operation:'hover'});
  assert.equal(compareTrial(t).comparable,false);
  assert.equal(evaluateExperiment([t]).status,'insufficient_evidence');
  t.comparison=sample([60,80,100],{environment:{...env,remote:true}});
  assert.equal(compareTrial(t).comparable,false);
  t.comparison=sample([60,80,100],{source:'measured_by_snail'});
  assert.equal(compareTrial(t).comparable,false);
});
test('invalid zero, negative, missing repetition and conflicting change are rejected',()=>{
  assert.equal(compareTrial(trial([0,1,2])).comparable,false);
  assert.equal(compareTrial(trial([20,20])).comparable,false);
  assert.equal(compareTrial(trial([200,200,200],[80,80,80],{singleChange:false})).comparable,false);
  assert.equal(evaluateExperiment([trial([100,100,100],[150,150,150])]).status,'insufficient_evidence');
});
test('a single improvement never verifies an extension or tsserver process',()=>{
  assert.notEqual(evaluateExperiment([trial([100,100,100],[50,50,50])]).status,'verified_by_experiment');
});
