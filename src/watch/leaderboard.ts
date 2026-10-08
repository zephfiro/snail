import type { ImportedCpuProfile } from './profile';
export interface RankedExtension {
  id:string;
  avgShare:number;
  peakShare?:number;
  highShareBuckets:number;
  samples:number;
  coverage:number;
  confidence:'estimated'|'insufficient';
}
export interface VillainCards {
  highestAverage?: RankedExtension;
  highestPeak?: RankedExtension;
  mostHighShareBuckets?: RankedExtension;
  investigateFirst?: RankedExtension;
  profileCoverage:number;
  profileDurationMs:number;
  notes:string[];
}
const pct=(a:number,b:number)=>b>0?Math.round(a/b*1000)/10:0;
export function computeVillainLeaderboard(profile?:ImportedCpuProfile,threshold=20):{
  ranking:RankedExtension[];cards:VillainCards
} {
  const none={ranking:[],cards:{
    profileCoverage:0,profileDurationMs:0,
    notes:['No extension-associated CPU profile for this session. No ranking can be inferred from host CPU/RSS alone.']
  }} as {ranking:RankedExtension[];cards:VillainCards};
  if(!profile||profile.samples<=0||!profile.buckets.length)return none;
  const coverage=pct(profile.recognizedSamples,profile.samples);
  const notes=[
    'CPU statistics below are sampled stack share, NOT one-core CPU utilization.',
    'Imported profiles have independent time origins and may not overlap the Watch recording.',
    'RAM rankings are unavailable without exclusively owned process measurements.'
  ];
  if(coverage<50)notes.push('Less than half the sampled stacks were recognized; any ranking is especially uncertain.');
  const meaningful=profile.samples>=20&&coverage>=50;
  const ranking:RankedExtension[]=profile.extensions.map(entry=>{
    let peak:number|undefined, highShareBuckets=0;
    for(const bin of profile.buckets){
      if(bin.samples<3)continue; // a single stack hit is not a meaningful spike
      const value=pct(bin.attributed.find(x=>x.id===entry.id)?.samples??0,bin.samples);
      peak=Math.max(peak??0,value);
      if(value>=threshold)highShareBuckets++;
    }
    return {
      id:entry.id,avgShare:pct(entry.samples,profile.samples),
      peakShare:peak,highShareBuckets,samples:entry.samples,
      coverage,confidence:meaningful?'estimated' as const:'insufficient' as const
    };
  }).sort((a,b)=>b.avgShare-a.avgShare||b.highShareBuckets-a.highShareBuckets||a.id.localeCompare(b.id));
  const candidates=ranking.filter(x=>x.confidence==='estimated');
  const highestPeak=[...candidates].filter(x=>x.peakShare!==undefined)
    .sort((a,b)=>(b.peakShare??0)-(a.peakShare??0)||a.id.localeCompare(b.id))[0];
  const sustained=[...candidates].sort((a,b)=>b.highShareBuckets-a.highShareBuckets||b.avgShare-a.avgShare||a.id.localeCompare(b.id))[0];
  // "Investigate first" is a suggestion, not a verified culprit.
  const investigateFirst=candidates[0]?.avgShare>=20?candidates[0]:undefined;
  return {ranking,cards:{
    profileCoverage:coverage,profileDurationMs:profile.durationMs,notes,
    highestAverage:candidates[0],highestPeak,
    mostHighShareBuckets:sustained?.highShareBuckets?sustained:undefined,
    investigateFirst
  }};
}
