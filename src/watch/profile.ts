import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface ExtensionRoot {id:string; rootPath:string}
export interface CpuProfileBucket {
  offsetMs:number;
  samples:number;
  attributed: {id:string; samples:number}[];
}
export interface ImportedCpuProfile {
  schemaVersion:1;
  source:'v8-cpuprofile-manual';
  importedAt:string;
  durationMs:number;
  bucketMs:number;
  samples:number;
  recognizedSamples:number;
  unknownSamples:number;
  /** No file paths, scripts, function names, raw stacks or original profile persisted. */
  buckets:CpuProfileBucket[];
  extensions: {id:string; samples:number}[];
}
interface Node {
  id:number;
  callFrame?:{url?:string};
  children?:number[];
  parent?:number;
}
interface Profile {
  nodes:Node[];
  samples:number[];
  timeDeltas:number[];
  startTime:number;
  endTime:number;
}
export const MAX_PROFILE_BYTES=8*1024*1024;
const MAX_SAMPLES=200000, MAX_NODES=100000, MAX_BUCKETS=600, BUCKET_US=500000;
export function validRoots(roots:readonly ExtensionRoot[]):ExtensionRoot[] {
  return roots.filter(r=>r.id.length>0&&r.id.length<=160&&path.isAbsolute(r.rootPath))
    .map(r=>({id:r.id,rootPath:path.resolve(r.rootPath)}))
    .sort((a,b)=>b.rootPath.length-a.rootPath.length);
}
export function extensionIdForUrl(url:unknown,roots:readonly ExtensionRoot[]):string|undefined {
  if(typeof url!=='string'||url.length>4096||!url.startsWith('file://'))return;
  let resolved:string;
  try{resolved=path.resolve(fileURLToPath(url))}catch{return;}
  for(const root of roots){
    const relative=path.relative(root.rootPath,resolved);
    if(relative && relative!=='.' && relative!=='..' &&
       !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative))return root.id;
  }
  return;
}
function parseProfile(raw:unknown):Profile {
  if(!raw||typeof raw!=='object')throw new Error('Invalid CPU profile structure');
  const p=raw as Partial<Profile>;
  if(!Array.isArray(p.nodes)||!Array.isArray(p.samples)||!Array.isArray(p.timeDeltas) ||
     p.nodes.length===0||p.nodes.length>MAX_NODES||
     p.samples.length===0||p.samples.length>MAX_SAMPLES||
     p.samples.length!==p.timeDeltas.length ||
     !Number.isFinite(p.startTime)||!Number.isFinite(p.endTime)||p.endTime!<=0) {
    throw new Error('Invalid or oversized V8 CPU profile');
  }
  if((p.endTime!-p.startTime!)>300_000_000||p.endTime!<=p.startTime!)
    throw new Error('CPU profile duration is out of bounds (max 5 minutes)');
  if(!p.nodes.every(n=>n&&Number.isSafeInteger(n.id)&&n.id>0)||
     !p.samples.every(n=>Number.isSafeInteger(n)&&n>0)||
     !p.timeDeltas.every(n=>Number.isFinite(n)&&n>0&&n<5_000_000)) {
    throw new Error('Invalid CPU profile counters');
  }
  return p as Profile;
}
/**
 * Sampling attribution is a relative fraction of stack samples, not real
 * percentage of a CPU core. Unknown frames remain unknown.
 */
export function importCpuProfile(raw:unknown,roots:readonly ExtensionRoot[],importedAt:string):ImportedCpuProfile {
  const profile=parseProfile(raw);
  const allowed=validRoots(roots);
  const map=new Map<number,Node>();
  const parent=new Map<number,number>();
  for(const node of profile.nodes) {
    if(map.has(node.id))throw new Error('Duplicate profile node identifiers');
    map.set(node.id,node);
  }
  for(const node of profile.nodes){
    if(typeof node.parent==='number' && map.has(node.parent))parent.set(node.id,node.parent);
    for(const child of node.children??[]) {
      if(!Number.isSafeInteger(child)||!map.has(child))continue;
      if(!parent.has(child))parent.set(child,node.id);
    }
  }
  const cache=new Map<number,string|undefined>();
  function owner(nodeId:number):string|undefined {
    if(cache.has(nodeId))return cache.get(nodeId);
    let current: number|undefined=nodeId;
    const seen=new Set<number>();
    for(let depth=0;depth<48&&current!==undefined&&!seen.has(current);depth++) {
      seen.add(current);
      const node:Node|undefined=map.get(current);
      if(!node)break;
      const id=extensionIdForUrl(node.callFrame?.url,allowed);
      if(id){cache.set(nodeId,id);return id;}
      current=parent.get(current);
    }
    cache.set(nodeId,undefined);return;
  }
  const bins=new Map<number,{samples:number;byId:Map<string,number>}>();
  const totals=new Map<string,number>();
  let unknownSamples=0,elapsedUs=0;
  for(let i=0;i<profile.samples.length;i++){
    elapsedUs+=profile.timeDeltas[i];
    const bucket=Math.floor(elapsedUs/BUCKET_US);
    if(bucket>=MAX_BUCKETS)throw new Error('Profile has too many time buckets');
    let bin=bins.get(bucket);
    if(!bin){bin={samples:0,byId:new Map()};bins.set(bucket,bin);}
    bin.samples++;
    const id=owner(profile.samples[i]);
    if(!id){unknownSamples++;continue;}
    bin.byId.set(id,(bin.byId.get(id)??0)+1);
    totals.set(id,(totals.get(id)??0)+1);
  }
  // Bounded cardinality avoids persisting large inventory or suspicious IDs.
  if(totals.size>80)throw new Error('Profile has too many attributed extensions');
  const buckets=[...bins].sort((a,b)=>a[0]-b[0]).map(([bucket,bin])=>({
    offsetMs:bucket*(BUCKET_US/1000),
    samples:bin.samples,
    attributed:[...bin.byId].map(([id,samples])=>({id,samples}))
      .sort((a,b)=>a.id.localeCompare(b.id))
  }));
  return {
    schemaVersion:1,source:'v8-cpuprofile-manual',importedAt,
    durationMs:Math.round(elapsedUs/1000),bucketMs:BUCKET_US/1000,
    samples:profile.samples.length,recognizedSamples:profile.samples.length-unknownSamples,
    unknownSamples,buckets,
    extensions:[...totals].map(([id,samples])=>({id,samples}))
      .sort((a,b)=>b.samples-a.samples||a.id.localeCompare(b.id))
  };
}
export function profileSeries(profile:ImportedCpuProfile):{
  id:string;name:string;confidence:'estimated';unit:'cpu-profile-share';source:string;
  points:{time:number;value:number}[]
}[] {
  return profile.extensions.map(ext=>({
    id:ext.id,name:ext.id,confidence:'estimated' as const,
    unit:'cpu-profile-share' as const,
    source:'Manual V8 CPU profile; share of all samples, not CPU core percent',
    points:profile.buckets.map(bin=>({
      time:bin.offsetMs,value:Math.round(((bin.attributed.find(x=>x.id===ext.id)?.samples??0)/bin.samples)*1000)/10
    }))
  }));
}
