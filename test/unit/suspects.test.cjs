const test=require('node:test');
const assert=require('node:assert/strict');
const {detectSuspects,rankSuspects}=require('../../dist/doctor/index.js');
const snapshot=values=>({get:id=>values[id]});
const ok=['process','workspace','settings'].map(id=>({id,status:'collected',durationMs:1}));
test('healthy workspace and low host CPU do not generate villains',()=>{
  const xs=detectSuspects(snapshot({
    process:{cpuPercentOneCore:8,rssMb:140,samplingMs:500},
    workspace:{scan:{candidates:[],limitReached:false}},
    settings:{watcherExclude:{}}
  }),ok);
  assert.deepEqual(xs,[]);
});
test('high aggregate host CPU never identifies an individual extension',()=>{
  const xs=detectSuspects(snapshot({process:{
    cpuPercentOneCore:95,rssMb:220,samplingMs:501
  }}),ok);
  assert.equal(xs.length,1);
  assert.equal(xs[0].category,'extension-host');
  assert.equal(xs[0].evidence[0].subject,'extension_host');
  assert.match(xs[0].evidence[0].limitation,/does not identify any extension/);
  assert.equal(rankSuspects(xs)[0].priority,'possible');
  assert.doesNotMatch(JSON.stringify(xs),/publisher\.extension/);
});
test('generated directories generate a hypothesis only when settings evidence is available',()=>{
  const values={workspace:{scan:{candidates:['node_modules'],limitReached:false}},settings:{watcherExclude:{}}};
  assert.equal(detectSuspects(snapshot(values),ok).length,1);
  assert.deepEqual(detectSuspects(snapshot(values),ok.filter(x=>x.id!=='settings')),[]);
  values.settings.watcherExclude={'**/node_modules/**':true};
  assert.deepEqual(detectSuspects(snapshot(values),ok),[]);
});
test('partial or cancelled collectors are not used as verified evidence',()=>{
  assert.deepEqual(detectSuspects(snapshot({process:{cpuPercentOneCore:99}}),
    [{id:'process',status:'timed_out',durationMs:10}]),[]);
});
test('ranking is deterministic and does not turn one reading into high confidence',()=>{
  const one={id:'a',title:'Host',category:'extension-host',status:'suspected',priority:'possible',priorityReason:'Only host observed',evidence:[
    {origin:'process',source:'measured_by_snail',subject:'extension_host',observation:'cpu',limitation:'sample'}]};
  const two={...one,id:'b',title:'Watcher',evidence:[
    {origin:'settings',source:'measured_by_snail',subject:'watcher',observation:'x',limitation:'none'},
    {origin:'workspace',source:'measured_by_snail',subject:'watcher',observation:'y',limitation:'none'}]};
  const sorted=rankSuspects([one,two]);
  assert.deepEqual(sorted.map(x=>x.id),['b','a']);
  assert.equal(sorted[1].priority,'possible');
  assert.match(sorted[0].priorityReason,/not confirmed/);
});
test('rule failures are isolated',()=>{
  const rules=[{id:'oops',evaluate(){throw Error('broken')}},{id:'valid',evaluate(){
    return {id:'x',title:'X',evidence:[{observation:'yes'}]}}}];
  assert.deepEqual(detectSuspects(snapshot({}),[],rules).map(x=>x.id),['x']);
});
