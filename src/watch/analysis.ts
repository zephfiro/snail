import type { WatchSample, WatchSession } from './types';

export interface WatchAnalysis {
  sampleCount: number;
  gaps: number;
  durationMs: number;
  meanCpu: number | undefined;
  medianCpu: number | undefined;
  p95Cpu: number | undefined;
  peakCpu: number | undefined;
  initialRssMiB: number | undefined;
  peakRssMiB: number | undefined;
  finalRssMiB: number | undefined;
  rssDeltaMiB: number | undefined;
  sustainedHighCpuIntervals: number;
  suspectedMemoryGrowth: boolean;
  notes: string[];
}
const round=(n:number)=>Math.round(n*10)/10;
const quantile=(values:number[],q:number):number|undefined=>{
  if(!values.length)return undefined;
  const s=[...values].sort((a,b)=>a-b);
  return s[Math.min(s.length-1,Math.ceil(q*s.length)-1)];
};
export function analyzeWatchSession(session:WatchSession):WatchAnalysis {
  const measured=session.samples.filter((s):s is Extract<WatchSample,{kind:'measured'}>=>s.kind==='measured');
  const cpu=measured.map(s=>s.cpuPercentOneCore);
  const rss=measured.map(s=>s.rssMiB);
  const notes:string[]=[];
  const gaps=session.samples.length-measured.length;
  let high=0, sustained=0;
  for(const s of session.samples){
    if(s.kind==='measured' && s.cpuPercentOneCore>=70)high++;
    else high=0;
    if(high===3)sustained++;
  }
  if(gaps)notes.push(gaps+' missing/delayed intervals. Gaps are not interpolated.');
  if(session.state!=='completed')notes.push('Session is incomplete; results may omit the final period.');
  if(measured.length<3)notes.push('Few samples; no reliable performance trend can be inferred.');
  const rssDeltaMiB=rss.length ? round(rss[rss.length-1]-rss[0]) : undefined;
  const suspectedMemoryGrowth=measured.length>=12 && rssDeltaMiB!==undefined &&
    rssDeltaMiB>=50 && rss[measured.length-1]>=rss[0]*1.2;
  if(sustained)notes.push('Multiple consecutive samples showed elevated CPU in the shared Extension Host. A specific extension is NOT identified.');
  if(suspectedMemoryGrowth)notes.push('RSS grew substantially during this session; this is NOT proof of an extension memory leak.');
  return {
    sampleCount:measured.length,gaps,
    durationMs:Math.max(0,Date.parse(session.endedAt??session.lastSavedAt)-Date.parse(session.startedAt)),
    meanCpu:cpu.length?round(cpu.reduce((a,b)=>a+b,0)/cpu.length):undefined,
    medianCpu:quantile(cpu,0.5),p95Cpu:quantile(cpu,0.95),
    peakCpu:cpu.length?Math.max(...cpu):undefined,
    initialRssMiB:rss[0],peakRssMiB:rss.length?Math.max(...rss):undefined,
    finalRssMiB:rss[rss.length-1],rssDeltaMiB,sustainedHighCpuIntervals:sustained,
    suspectedMemoryGrowth,notes
  };
}

/** Keep at most max points, selecting actual samples only; never invent intermediate measurements. */
export function downsampleWatch(samples:readonly WatchSample[],max=120):WatchSample[] {
  if(samples.length<=max)return [...samples];
  if(max<2)return [];
  const result:WatchSample[]=[];
  for(let i=0;i<max;i++)result.push(samples[Math.floor(i*(samples.length-1)/(max-1))]);
  return result;
}
