const test=require('node:test');
const assert=require('node:assert/strict');
const {createShareableReport}=require('../../dist/report-export.js');
const {renderGroupedFindings,renderCollectorStatuses}=require('../../dist/report-view.js');
const {settingsAnalyzer}=require('../../dist/core/index.js');
const {detectSuspects}=require('../../dist/doctor/index.js');

const report=()=>({
  schemaVersion:1,timestamp:'2026-10-08T12:00:00Z',
  environment:{vscodeVersion:'1.94.0',platform:'linux',remote:false},
  summary:{installedExtensions:3,activeExtensions:2,scannedEntries:11,limitReached:false},
  process:{cpuPercentOneCore:90,rssMb:100,samplingMs:500,scope:'/home/alice/private'},
  extensionInventory:[{id:'private.company',displayName:'secretPassword',isActive:true}],
  findings:[{
    id:'extension-host-cpu',title:'private.company Password=1234',
    category:'process',severity:'warning',confidence:'measured',
    evidence:'/home/alice/repository/.env; TOKEN=ABCDEF; user@example.com',
    recommendation:'C:\\Users\\Alice\\Documents\\key.pem',
    sources:['process','private.company']
  }],
  suspects:[{
    id:'extension-host-cpu',title:'private.company; /home/alice/secret',priority:'possible',
    status:'suspected',category:'extension-host',hypothesis:'my secret',
    evidence:[{observation:'my secret'}],nextStep:'private url'
  }],
  warnings:['/home/alice/.ssh/id_rsa'],
  collectors:[{id:'process',status:'collected',durationMs:5},
    {id:'/home/alice/private',status:'failed',durationMs:1}]
});
test('export never includes injected paths, emails, secrets or internal extension IDs',()=>{
  const exported=createShareableReport(report());
  const json=JSON.stringify(exported);
  for(const secret of ['alice','company','Password','TOKEN','ABCDEF','user@example.com','key.pem','repository','my secret']){
    assert.ok(!json.includes(secret), 'should omit '+secret);
  }
  assert.ok(!('extensionInventory' in exported));
  assert.equal(exported.suspects[0].id,'extension-host-cpu');
  assert.deepEqual(exported.findings[0].sources,['process']);
  assert.equal(exported.collectors.length,1);
  assert.equal(exported.process.cpuPercentOneCore,90);
});
test('unknown free-text findings are never shipped',()=>{
  const r=report();r.findings[0].id='private-plugin-abc';r.suspects[0].id='secret-plugin-xyz';
  const result=createShareableReport(r);
  assert.deepEqual(result.findings,[]);
  assert.deepEqual(result.suspects,[]);
});
test('settings rules are observational, not measured tsserver CPU',()=>{
  const findings=settingsAnalyzer.analyze({watcherExclude:{},tsServerLogLevel:'verbose'});
  assert.equal(findings.length,1);
  assert.equal(findings[0].confidence,'inferred');
  assert.match(findings[0].evidence,/not proof/);
  const sources={get:id=>id==='settings'?{tsServerLogLevel:'verbose'}:undefined};
  const suspects=detectSuspects(sources,[{id:'settings',status:'collected'}]);
  const ts=suspects.find(x=>x.id==='tsserver-verbose-logging');
  assert.ok(ts);
  assert.equal(ts.category,'configuration');
  assert.equal(ts.evidence[0].source,'inferred');
  assert.deepEqual(settingsAnalyzer.analyze({watcherExclude:{},tsServerLogLevel:'off'}),[]);
});
test('Webview groups confidence labels and exposes timeout evidence without scripts',()=>{
  const r=report();r.findings.push({id:'a',title:'Config',category:'settings',severity:'info',confidence:'inferred',
    evidence:'Possible',recommendation:'Review'});
  const html=renderGroupedFindings(r);
  assert.match(html,/Measured observations/);
  assert.match(html,/Hypotheses and inferred findings/);
  assert.ok(html.indexOf('Measured observations')<html.indexOf('Hypotheses and inferred findings'));
  const status=renderCollectorStatuses({...r,collectors:[{id:'workspace',status:'timed_out',durationMs:2500}]});
  assert.match(status,/timed_out/);
  assert.match(status,/2500ms/);
});
