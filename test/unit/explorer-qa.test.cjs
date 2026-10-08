const test=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm');
const {renderVillainsExplorer}=require('../../dist/watch/explorer.js');
const session={
 schemaVersion:1,id:'00000000-0000-4000-8000-000000000001',instanceId:'test',
 startedAt:'2026-10-08T12:00:00Z',lastSavedAt:'2026-10-08T12:01:00Z',endedAt:'2026-10-08T12:01:00Z',
 state:'completed',intervalMs:5000,maxDurationMs:60000,
 environment:{vscodeVersion:'1.94',platform:'linux',remote:false,scope:'current-node-extension-host'},
 samples:[
  {kind:'measured',timestamp:'2026-10-08T12:00:05Z',elapsedMs:5000,cpuPercentOneCore:0,rssMiB:500},
  {kind:'gap',timestamp:'2026-10-08T12:00:15Z',elapsedMs:15000,reason:'delayed'},
  {kind:'measured',timestamp:'2026-10-08T12:00:20Z',elapsedMs:5000,cpuPercentOneCore:99,rssMiB:550}
 ]
};
const findScript=html=>html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
test('generated Webview script compiles in Chromium-compatible JavaScript',()=>{
 const html=renderVillainsExplorer(session,{nonce:'allowedNonce'});
 const script=findScript(html);
 assert.ok(script && script.length>100);
 assert.doesNotThrow(()=>new vm.Script(script));
 assert.match(html,/script-src 'nonce-allowedNonce'/);
 assert.match(html,/style-src 'nonce-allowedNonce'/);
 assert.doesNotMatch(html,/<script[^>]+src=|<img[^>]+src=\"https?:/);
});
test('CSP-safe colors use JS-applied properties instead of unauthorized style attributes',()=>{
 const html=renderVillainsExplorer(session,{
  nonce:'safe',cpuSeries:[{id:'vendor.one',name:'Vendor One',unit:'cpu-profile-share',
    source:'manual',confidence:'estimated',points:[{time:0,value:10},{time:500,value:20}]}]
 });
 assert.match(html,/data-color="#[0-9a-f]{6}"/);
 assert.doesNotMatch(html,/<span class="dot" style=/);
 assert.match(html,/style\.setProperty/);
 assert.doesNotThrow(()=>new vm.Script(findScript(html)));
});
test('dense profile, many extensions and unsafe labels preserve bounded data and valid JS',()=>{
 const series=Array.from({length:60},(_,i)=>({
   id:'publisher.extension'+i,name:'<img src=x onerror=bad()>',unit:'cpu-profile-share',
   confidence:'estimated',source:'v8-cpuprofile',
   points:Array.from({length:250},(_,j)=>({time:j*500,value:(i+j)%100}))
 }));
 const html=renderVillainsExplorer(session,{nonce:'safe',cpuSeries:series});
 assert.match(html,/Top 10/);
 assert.match(html,/id="sortBy"/);
 assert.match(html,/id="onlySuspects"/);
 assert.doesNotMatch(html,/<img src=x onerror/);
 assert.doesNotThrow(()=>new vm.Script(findScript(html)));
});
test('legacy sessions with no attribution show both host graphs and no imaginary villains',()=>{
 const html=renderVillainsExplorer(session,{nonce:'safe'});
 assert.match(html,/id="cpuChart"/);
 assert.match(html,/id="ramChart"/);
 assert.match(html,/No attributable extension samples available/);
 assert.match(html,/Only host-level measurements exist/);
 assert.match(html,/Insufficient evidence/);
});
