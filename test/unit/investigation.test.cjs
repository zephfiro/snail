const test=require('node:test');
const assert=require('node:assert/strict');
const {planForSuspect,TYPESCRIPT_INVESTIGATION,renderInvestigation}=require('../../dist/doctor/index.js');
const categories=['extension-host','watcher','configuration','language-server','extension','workspace'];
test('typescript plan requires direct evidence, baseline, reversible intervention and comparison',()=>{
  const p=TYPESCRIPT_INVESTIGATION;
  assert.equal(p.subject,'typescript_language_server');
  assert.equal(p.steps.length,6);
  assert.match(p.limitations.join(' '),/NOT tsserver CPU/);
  assert.match(p.steps.map(x=>x.instructions).join(' '),/Project Configuration/);
  assert.match(p.steps.map(x=>x.instructions).join(' '),/TS Server Log/);
  assert.ok(p.steps.some(x=>x.reversal));
});
test('all suspect categories have non-destructive investigation plans',()=>{
  for(const category of categories){
    const p=planForSuspect({id:'sample',title:'<sample>',hypothesis:'Needs tests',category,nextStep:'Investigate'});
    assert.ok(p.steps.length>=2);
    assert.doesNotMatch(JSON.stringify(p),/execute arbitrary shell|run automatically/i);
  }
});
test('the investigation Webview escapes untrusted text with restrictive CSP',()=>{
  const html=renderInvestigation(planForSuspect({
    id:'x',title:'<script>alert(1)</script>',hypothesis:'<img onerror="x">',
    category:'workspace',nextStep:'Investigate'
  }));
  assert.match(html,/default-src 'none'/);
  assert.doesNotMatch(html,/<script>|<img onerror/);
  assert.match(html,/&lt;script&gt;/);
});
