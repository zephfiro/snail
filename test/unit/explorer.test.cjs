const test=require('node:test');
const assert=require('node:assert/strict');
const {renderVillainsExplorer,seriesColor}=require('../../dist/watch/index.js');
const session={
  schemaVersion:1,id:'00000000-0000-4000-8000-000000000001',instanceId:'x',
  state:'completed',startedAt:'2026-10-08T10:00:00.000Z',
  endedAt:'2026-10-08T10:01:00.000Z',lastSavedAt:'2026-10-08T10:01:00.000Z',
  intervalMs:5000,maxDurationMs:900000,environment:{vscodeVersion:'1.94',platform:'linux',remote:false,scope:'current-node-extension-host'},
  samples:[
    {kind:'measured',timestamp:'2026-10-08T10:00:05.000Z',elapsedMs:5000,cpuPercentOneCore:21,rssMiB:180},
    {kind:'gap',timestamp:'2026-10-08T10:00:10.000Z',elapsedMs:15000,reason:'delayed'},
    {kind:'measured',timestamp:'2026-10-08T10:00:20.000Z',elapsedMs:5000,cpuPercentOneCore:43,rssMiB:205}
  ]
};
test('two separate charts display real host evidence, not imaginary extension figures',()=>{
 const html=renderVillainsExplorer(session,{nonce:'safeNonce123'});
 assert.match(html,/id="cpuChart"/);
 assert.match(html,/id="ramChart"/);
 assert.match(html,/Only host-level measurements exist/);
 assert.match(html,/No extension-level evidence is attached/);
 assert.match(html,/Host peak CPU/);
 assert.match(html,/RSS change/);
 assert.match(html,/default-src 'none'/);
 assert.match(html,/script-src 'nonce-safeNonce123'/);
});
test('different extension line units are not combined into one CPU core scale',()=>{
 const html=renderVillainsExplorer(session,{nonce:'test123',
   cpuSeries:[{id:'vendor.extension',name:'Example Extension',unit:'cpu-profile-share',
     confidence:'estimated',source:'v8-cpuprofile',points:[{time:100,value:19},{time:200,value:55}]}]});
 assert.match(html,/Profile sample-share/);
 assert.match(html,/One CPU core/);
 assert.match(html,/Extension profiles: % of sampled CPU stack time/);
 assert.match(html,/vendor.extension/);
});
test('unsupported RAM claims are excluded from plotted series',()=>{
 const html=renderVillainsExplorer(session,{nonce:'test123',ramSeries:[
  {id:'fake',name:'FAKE-RAM',unit:'rss-mib',confidence:'unavailable',source:'none',points:[{time:2,value:999}]}
 ]});
 assert.doesNotMatch(html,/FAKE-RAM/);
 assert.match(html,/Only host-level measurements exist/);
});
test('untrusted extension labels and script-breaking strings are escaped',()=>{
 const html=renderVillainsExplorer(session,{nonce:'clean123',cpuSeries:[
   {id:'vendor.unsafe',name:'<script>alert(1)</script>',unit:'cpu-profile-share',
     confidence:'estimated',source:'profile',points:[{time:0,value:42}]}
 ]});
 assert.doesNotMatch(html,/<script>alert/);
 assert.match(html,/&lt;script&gt;/);
 assert.match(html,/\\u003cscript\\u003e/);
});
test('colors are consistent across panels, order and repeated calls',()=>{
 assert.equal(seriesColor('vendor.one'),seriesColor('vendor.one'));
 assert.match(seriesColor('vendor.one'),/^#[a-f0-9]{6}$/);
});
