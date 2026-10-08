const test=require('node:test'),assert=require('node:assert/strict');
const {computeVillainLeaderboard}=require('../../dist/watch/leaderboard.js');
const {renderVillainsExplorer}=require('../../dist/watch/explorer.js');
const sample=(count=40,known=35)=>({
 schemaVersion:1,source:'v8-cpuprofile-manual',importedAt:'2026-10-08T11:00:00Z',
 durationMs:5000,bucketMs:500,samples:count,recognizedSamples:known,unknownSamples:count-known,
 extensions:[{id:'vendor.alpha',samples:25},{id:'vendor.beta',samples:10}],
 buckets:[
   {offsetMs:0,samples:10,attributed:[{id:'vendor.alpha',samples:6},{id:'vendor.beta',samples:2}]},
   {offsetMs:500,samples:10,attributed:[{id:'vendor.alpha',samples:6},{id:'vendor.beta',samples:3}]},
   {offsetMs:1000,samples:10,attributed:[{id:'vendor.alpha',samples:7},{id:'vendor.beta',samples:2}]},
   {offsetMs:1500,samples:10,attributed:[{id:'vendor.alpha',samples:6},{id:'vendor.beta',samples:3}]}
 ]
});
const session={
 schemaVersion:1,id:'00000000-0000-4000-8000-000000000001',instanceId:'a',
 state:'completed',startedAt:'2026-10-08T11:00:00Z',lastSavedAt:'2026-10-08T11:01:00Z',
 endedAt:'2026-10-08T11:01:00Z',intervalMs:5000,maxDurationMs:60000,
 environment:{vscodeVersion:'1.94',platform:'linux',remote:false,scope:'current-node-extension-host'},
 samples:[{kind:'measured',timestamp:'2026-10-08T11:00:05Z',elapsedMs:5000,cpuPercentOneCore:28,rssMiB:240}]
};
test('high-confidence profile produces a prioritized *suspect*, not confirmed blame',()=>{
 const b=computeVillainLeaderboard(sample());
 assert.deepEqual(b.ranking.map(x=>x.id),['vendor.alpha','vendor.beta']);
 assert.equal(b.ranking[0].avgShare,62.5);
 assert.equal(b.cards.highestAverage.id,'vendor.alpha');
 assert.equal(b.cards.highestPeak.peakShare,70);
 assert.equal(b.cards.mostHighShareBuckets.highShareBuckets,4);
 assert.equal(b.cards.investigateFirst.id,'vendor.alpha');
 assert.equal(b.cards.profileCoverage,87.5);
 assert.match(b.cards.notes.join(' '),/NOT one-core CPU utilization/);
});
test('single samples cannot create fake CPU spikes',()=>{
 const p=sample();
 p.buckets=[{offsetMs:0,samples:1,attributed:[{id:'vendor.alpha',samples:1}]}];
 assert.equal(computeVillainLeaderboard(p).ranking[0].peakShare,undefined);
 assert.equal(computeVillainLeaderboard(p).cards.highestPeak,undefined);
});
test('insufficient profile coverage cannot name a winner',()=>{
 const p=sample(40,4);
 const b=computeVillainLeaderboard(p);
 assert.equal(b.cards.highestAverage,undefined);
 assert.equal(b.cards.investigateFirst,undefined);
 assert.match(b.cards.notes.join(' '),/uncertain/);
});
test('no CPU profile yields N/A top extension cards, not a fabricated ranking',()=>{
 const html=renderVillainsExplorer(session,{nonce:'fixed'});
 assert.match(html,/Highest avg CPU share/);
 assert.match(html,/Highest RAM/);
 assert.match(html,/Insufficient evidence/);
 assert.match(html,/N\/A/);
 assert.match(html,/No attributable extension samples/);
});
test('leaderboard carries icon and escaped display name without leaking script',()=>{
 const profile=sample(),html=renderVillainsExplorer(session,{
 nonce:'fixed',cpuProfile:profile,cpuSeries:[{
  id:'vendor.alpha',name:'vendor.alpha',confidence:'estimated',unit:'cpu-profile-share',
  source:'manual',points:[{time:0,value:60},{time:500,value:70}]
 }],knownExtensions:[{id:'vendor.alpha',name:'<script>Example</script>',version:'1.0',activeNow:true}]
 });
 assert.match(html,/Highest avg CPU share/);
 assert.match(html,/vendor.alpha/);
 assert.match(html,/&lt;script&gt;Example&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>Example/);
 assert.match(html,/data-investigate=/);
 assert.match(html,/id="leaderboard"/);
 assert.match(html,/id="sortBy"/);
 assert.match(html,/id="onlySuspects"/);
});
