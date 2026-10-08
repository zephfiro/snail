const test=require('node:test'), assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {importCpuProfile,profileSeries,extensionIdForUrl}=require('../../dist/watch/profile.js');
const {isWatchSession}=require('../../dist/watch/index.js');
const root=path.resolve('/extensions/demo.author-1.0.0');
const unknown=path.resolve('/other/shared.js');
const frame=name=>pathToFileURL(path.join(root,name)).href;
const fakeProfile=()=>({
  startTime:1000,endTime:2001000,
  nodes:[
    {id:1,callFrame:{url:''},children:[2,3]},
    {id:2,callFrame:{url:frame('out/extension.js')}},
    {id:3,callFrame:{url:pathToFileURL(unknown).href}}
  ],
  samples:[2,2,3,2,3,2],
  timeDeltas:[100000,100000,100000,200000,100000,100000]
});
const roots=[{id:'demo.author',rootPath:root}];
test('validates exact extension root boundary and rejects malicious unmatched paths',()=>{
  assert.equal(extensionIdForUrl(frame('out/extension.js'),roots),'demo.author');
  assert.equal(extensionIdForUrl(pathToFileURL(root+'-fake/out/main.js').href,roots),undefined);
  assert.equal(extensionIdForUrl('https://malicious.example/a.js',roots),undefined);
  assert.equal(extensionIdForUrl('node:fs',roots),undefined);
  assert.equal(extensionIdForUrl('../../ext.js',roots),undefined);
});
test('profile attribution reports sample share, unknown coverage and bounded bins',()=>{
 const p=importCpuProfile(fakeProfile(),roots,'2026-10-08T10:00:00Z');
 assert.equal(p.samples,6);
 assert.equal(p.recognizedSamples,4);
 assert.equal(p.unknownSamples,2);
 assert.deepEqual(p.extensions,[{id:'demo.author',samples:4}]);
 assert.equal(p.source,'v8-cpuprofile-manual');
 const series=profileSeries(p);
 assert.equal(series.length,1);
 assert.equal(series[0].unit,'cpu-profile-share');
 assert.equal(series[0].confidence,'estimated');
 assert.ok(series[0].points.every(x=>x.value>=0&&x.value<=100));
 assert.doesNotMatch(JSON.stringify(p),/out\/extension.js|extensions\/demo/);
});
test('missing extension root yields no falsely attributed metric',()=>{
 const p=importCpuProfile(fakeProfile(),[],new Date().toISOString());
 assert.equal(p.recognizedSamples,0);
 assert.equal(p.unknownSamples,6);
 assert.deepEqual(profileSeries(p),[]);
});
test('rejects malformed, oversized and negative profiles without partial fabricated readings',()=>{
 const p=fakeProfile();
 for(const altered of [{...p,samples:[1,2]}, {...p,timeDeltas:[-1,2,3,4,5,6]},
  {...p,nodes:[]}, {...p,endTime:400000000}, {...p,samples:Array(200001).fill(2)}]){
   assert.throws(()=>importCpuProfile(altered,roots,'now'),/Invalid|bounds|out of bounds|oversized/);
 }
});
test('cycles in call graph terminate and unknown nodes remain unattributed',()=>{
 const p=fakeProfile();
 p.nodes[0].children=[2];p.nodes[1].children=[1];
 p.nodes[1].callFrame.url='';
 const value=importCpuProfile(p,roots,'2026-10-08T10:00:00Z');
 assert.equal(value.recognizedSamples,0);
});
test('legacy Watch session data remains valid without profiles',()=>{
 const s={
 schemaVersion:1,id:'00000000-0000-4000-8000-000000000001',instanceId:'test',
 startedAt:'2026-10-08T10:00:00Z',lastSavedAt:'2026-10-08T10:00:30Z',state:'completed',
 intervalMs:5000,maxDurationMs:60000,environment:{vscodeVersion:'1.94',platform:'linux',remote:false,scope:'current-node-extension-host'},samples:[]
 };
 assert.equal(isWatchSession(s),true);
 assert.equal(isWatchSession({...s,cpuProfiles:[importCpuProfile(fakeProfile(),roots,new Date().toISOString())]}),true);
});
