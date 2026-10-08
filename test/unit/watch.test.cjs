const test=require('node:test');
const assert=require('node:assert/strict');
const {
  WatchMonitor, createWatchSampler, analyzeWatchSession, downsampleWatch,
  WATCH_INTERVAL_MS, MAX_WATCH_DURATION_MS, isWatchSession, renderWatchAnalysis
}=require('../../dist/watch/index.js');

const iso='2026-10-08T15:00:00.000Z';
function makeSession(samples=[],state='completed'){
  return {
    schemaVersion:1,id:'00000000-0000-4000-8000-000000000001',instanceId:'local-only',
    startedAt:iso,endedAt:'2026-10-08T15:15:00.000Z',
    lastSavedAt:'2026-10-08T15:15:00.000Z',state,intervalMs:5000,maxDurationMs:900000,
    environment:{vscodeVersion:'1.94.0',platform:'linux',remote:false,scope:'current-node-extension-host'},samples
  };
}
function measure(cpu,rss,second=1){return {kind:'measured',timestamp:new Date(Date.parse(iso)+second*5000).toISOString(),
  elapsedMs:5000,cpuPercentOneCore:cpu,rssMiB:rss};}
function fakeSource(){
  let time=0n;
  return {
    nowNs:()=>{time+=5000000000n;return time;},
    cpuUsage:previous=>previous?{user:2500000,system:250000}:{user:0,system:0},
    rssBytes:()=>200*1048576,
    sleep:async()=>{}
  };
}
function createMonitor(){
  const saves=[],errors=[];let clock=Date.parse(iso),timer,scheduled=0;
  const store={
    save:async s=>{saves.push({...s,samples:s.samples.map(x=>({...x}))});},
    list:async()=>saves,delete:async()=>{},prune:async()=>{}
  };
  const watch=new WatchMonitor({
    store,processSource:fakeSource,
    environment:{vscodeVersion:'1.94.0',platform:'linux',remote:false,scope:'current-node-extension-host'},
    clock:{
      nowMs:()=>clock,
      schedule:(_ms,fn)=>{scheduled++;timer=fn;return ()=>{if(timer===fn)timer=undefined;};}
    },
    onError:msg=>errors.push(msg)
  });
  return {watch,saves,errors,
    tick:async(ms=5000)=>{clock+=ms;const fn=timer;assert.ok(fn,'expected active timer');timer=undefined;fn();await new Promise(resolve=>setImmediate(resolve));},
    pendingTimer:()=>Boolean(timer),
    scheduled:()=>scheduled
  };
}
test('opt-in: sampler and timers are never started by constructing a monitor',()=>{
  const x=createMonitor();assert.equal(x.watch.active,false);assert.equal(x.scheduled(),0);
});
test('record/stop is explicit, returns a saved session and never samples while off',async()=>{
  const x=createMonitor();
  const s=await x.watch.start(15000);
  assert.equal(s.state,'recording');
  assert.equal(x.saves.length,1);
  assert.equal(x.pendingTimer(),true);
  await x.tick();await x.tick();
  assert.equal(s.samples.length,2);
  const completed=await x.watch.stop();
  assert.equal(completed.state,'completed');
  assert.equal(x.pendingTimer(),false);
  assert.equal(x.watch.active,false);
  assert.equal(x.saves.at(-1).samples.length,2);
  assert.equal(x.saves.at(-1).state,'completed');
  assert.equal((await x.watch.stop()),undefined);
});
test('fixed-duration watch auto stops and records the final sample',async()=>{
  const x=createMonitor();await x.watch.start(10000);await x.tick();await x.tick();
  assert.equal(x.watch.active,false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(x.saves.at(-1).state,'completed');
  assert.equal(x.saves.at(-1).samples.length,2);
  assert.equal(x.pendingTimer(),false);
});
test('start twice does not create overlapping session samplers',async()=>{
  const x=createMonitor();await x.watch.start();
  await assert.rejects(x.watch.start(),/already active/);
  await x.watch.stop();
});
test('failed session persistence prevents sampling from starting',async()=>{
  let created=0;
  const watch=new WatchMonitor({
    store:{save:async()=>{throw Error('disk unavailable')},list:async()=>[],delete:async()=>{},prune:async()=>{}},
    processSource:()=>{created++;return fakeSource();},
    environment:{vscodeVersion:'1.94',platform:'linux',remote:false,scope:'current-node-extension-host'},
    clock:{nowMs:()=>Date.parse(iso),schedule:()=>{throw Error('must not start')}}
  });
  await assert.rejects(watch.start(),/disk unavailable/);
  assert.equal(watch.active,false);
  assert.equal(created,1);
});
test('source sampler records CPU as one-core percent, RSS and gaps on timer stalls',()=>{
  const sampler=createWatchSampler(fakeSource(),WATCH_INTERVAL_MS);
  const first=sampler.capture('2026-10-08T15:00:05Z');
  assert.equal(first.kind,'measured');assert.equal(first.cpuPercentOneCore,55);
  assert.equal(first.rssMiB,200);
  let time=0n;
  const stalled=createWatchSampler({
    nowNs:()=>{time+=20000000000n;return time;},
    cpuUsage:p=>p?{user:1000000,system:0}:{user:0,system:0},
    rssBytes:()=>10000000,sleep:async()=>{}
  },5000);
  assert.equal(stalled.capture('2026-10-08T15:00:20Z').kind,'gap');
  assert.equal(stalled.capture('2026-10-08T15:00:40Z').reason,'delayed');
});
test('history validator rejects corrupt, oversized or sensitive-looking structures',()=>{
  const session=makeSession([measure(5,100)]);
  assert.equal(isWatchSession(session),true);
  assert.equal(isWatchSession({...session,id:'../secrets'}),false);
  assert.equal(isWatchSession({...session,samples:Array(1500).fill(measure(1,1))}),false);
  assert.equal(isWatchSession({...session,samples:[{kind:'measured',timestamp:iso,elapsedMs:5000,cpuPercentOneCore:NaN,rssMiB:1}]}),false);
});
test('session analytics separate isolated peaks, sustained CPU and gaps',()=>{
  const cpu=[5,99,5,75,80,78,5,6];
  const samples=cpu.map((c,i)=>measure(c,100+i,i+1));
  samples.push({kind:'gap',timestamp:iso,elapsedMs:15000,reason:'delayed'});
  const analysis=analyzeWatchSession(makeSession(samples));
  assert.equal(analysis.sustainedHighCpuIntervals,1);
  assert.equal(analysis.gaps,1);
  assert.equal(analysis.peakCpu,99);
  assert.equal(analysis.sampleCount,cpu.length);
  assert.match(analysis.notes.join(' '),/NOT identified/);
});
test('a few readings are insufficient to conclude a memory leak',()=>{
  assert.equal(analyzeWatchSession(makeSession([measure(20,100),measure(30,350)])).suspectedMemoryGrowth,false);
  const many=Array.from({length:14},(_,i)=>measure(10,100+i*7,i+1));
  assert.equal(analyzeWatchSession(makeSession(many)).suspectedMemoryGrowth,true);
  assert.match(analyzeWatchSession(makeSession(many)).notes.join(' '),/NOT proof/);
});
test('downsample preserves real source samples without synthetic interpolation',()=>{
  const samples=Array.from({length:500},(_,i)=>measure(i%30,100+i/5,i+1));
  const result=downsampleWatch(samples,50);
  assert.equal(result.length,50);
  assert.strictEqual(result[0],samples[0]);
  assert.strictEqual(result.at(-1),samples.at(-1));
});
test('offline panel renders statistics and limitations without scripts',()=>{
  const html=renderWatchAnalysis(makeSession([measure(20,100),measure(80,110),measure(75,120)]));
  assert.match(html,/Snail Watch/);
  assert.match(html,/p95 CPU/);
  assert.match(html,/Node Extension Host/);
  assert.match(html,/default-src 'none'/);
  assert.match(html,/role="img"/);
  assert.doesNotMatch(html,/<script>/);
});
test('maximum session duration is bounded',async()=>{
  const x=createMonitor();await assert.rejects(x.watch.start(MAX_WATCH_DURATION_MS+1),/Invalid/);
  await x.watch.start(MAX_WATCH_DURATION_MS);await x.watch.stop();
});
