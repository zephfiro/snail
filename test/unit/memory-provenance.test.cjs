const test=require('node:test'),assert=require('node:assert/strict');
const {verifiedMemorySeries}=require('../../dist/watch/index.js');
const {renderVillainsExplorer}=require('../../dist/watch/explorer.js');
const s={schemaVersion:1,id:'00000000-0000-4000-8000-000000000001',instanceId:'test',
  startedAt:'2026-10-08T10:00:00Z',endedAt:'2026-10-08T10:00:10Z',lastSavedAt:'2026-10-08T10:00:10Z',
  state:'completed',intervalMs:5000,maxDurationMs:30000,
  environment:{vscodeVersion:'1.94',platform:'linux',remote:false,scope:'current-node-extension-host'},samples:[
    {kind:'measured',timestamp:'2026-10-08T10:00:05Z',elapsedMs:5000,cpuPercentOneCore:35,rssMiB:300}
  ]};
const reading={
 extensionId:'vendor.ext',displayName:'Example',source:'verified-dedicated-process',
 processId:1234,ownerVerified:true,exclusiveOwner:true,unit:'rss-mib',
 points:[{time:0,rssMiB:55},{time:1000,rssMiB:65}]
};
test('shared or unverified process RAM is never assigned to extensions',()=>{
  assert.deepEqual(verifiedMemorySeries([{...reading,exclusiveOwner:false}]),[]);
  assert.deepEqual(verifiedMemorySeries([{...reading,ownerVerified:false}]),[]);
  assert.deepEqual(verifiedMemorySeries([{...reading,processId:0}]),[]);
  assert.deepEqual(verifiedMemorySeries([{...reading,points:[{time:0,rssMiB:55}]}]),[]);
});
test('only verified dedicated-process memory can produce a line',()=>{
 const actual=verifiedMemorySeries([reading]);
 assert.equal(actual.length,1);
 assert.equal(actual[0].confidence,'measured');
 assert.equal(actual[0].unit,'rss-mib');
 assert.equal(actual[0].source,'verified-dedicated-process');
 assert.equal(actual[0].points[1].value,65);
});
test('an unverified RAM series is excluded from the explorer regardless of supplied numbers',()=>{
 const html=renderVillainsExplorer(s,{nonce:'valid',ramSeries:[
    {...verifiedMemorySeries([reading])[0],source:'shared-host-estimate',name:'SHOULD_NOT_SHOW'}
  ]});
 assert.doesNotMatch(html,/SHOULD_NOT_SHOW/);
 assert.match(html,/Only host-level measurements exist/);
});
test('historical sessions contain only host RSS and no extension RAM values',()=>{
 const html=renderVillainsExplorer(s,{nonce:'valid',knownExtensions:[
  {id:'vendor.ext',name:'Example',activeNow:true}
 ]});
 assert.match(html,/RAM N\/A/);
 assert.match(html,/Host peak RSS/);
 assert.doesNotMatch(html,/Example.*65 MiB/);
});
