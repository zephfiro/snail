import type { WatchSession, WatchSample } from './types';
import { analyzeWatchSession } from './analysis';

const htmlEscape = (value:string) => value.replace(/[&<>"']/g,
  char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const fmt=(value:number|undefined,unit='')=>
  value===undefined ? 'N/A' : String(Math.round(value*10)/10)+unit;
function lines(session:WatchSession,key:'cpuPercentOneCore'|'rssMiB',label:string):string {
  const valid=session.samples.filter((s):s is Extract<WatchSample,{kind:'measured'}>=>s.kind==='measured');
  if(!valid.length)return '<p class="muted">No reliable '+htmlEscape(label)+' samples.</p>';
  const top=150,bottom=15,left=14,right=736;
  const values=valid.map(x=>x[key]),low=Math.min(...values),high=Math.max(...values);
  const range=Math.max(high-low,1);
  const started=Date.parse(session.startedAt);
  const end=Date.parse(session.endedAt??session.lastSavedAt);
  const span=Math.max(end-started,1);
  const scaleX=(s:WatchSample)=>left+(Date.parse(s.timestamp)-started)/span*(right-left);
  const scaleY=(v:number)=>top-(v-low)/range*(top-bottom);
  const sections:string[][]=[];
  let current:string[]=[];
  // Sample at most 250 input entries, preserving gap boundaries as breaks.
  const stride=Math.max(1,Math.ceil(session.samples.length/250));
  for(let i=0;i<session.samples.length;i++){
    const s=session.samples[i];
    if(s.kind==='gap'){if(current.length)sections.push(current);current=[];continue;}
    if(i%stride!==0 && i!==session.samples.length-1)continue;
    current.push(scaleX(s).toFixed(1)+','+scaleY(s[key]).toFixed(1));
  }
  if(current.length)sections.push(current);
  const shapes=sections.map(points=>points.length>=2
    ? '<polyline points="'+points.join(' ')+'" fill="none" stroke="currentColor" stroke-width="2"/>'
    : '<circle cx="'+points[0].split(',')[0]+'" cy="'+points[0].split(',')[1]+'" r="2" fill="currentColor"/>').join('');
  return '<div class="chart"><p class="muted">'+htmlEscape(label)+
    ' (range '+fmt(low)+'–'+fmt(high)+'; gaps break the series)</p>'+
    '<svg viewBox="0 0 750 170" role="img" aria-label="'+htmlEscape(label)+
    ' over session time; missing intervals omitted"><path d="M14 150H736" stroke="currentColor" opacity=".25"/>'+
    shapes+'</svg></div>';
}
export function renderWatchAnalysis(session:WatchSession):string {
  const analysis=analyzeWatchSession(session);
  const stat=(name:string,value:string)=>'<div class="metric"><span class="muted">'+name+'</span><strong>'+htmlEscape(value)+'</strong></div>';
  const samples=analysis.sampleCount;
  const state=session.state==='recording' && Date.now()-Date.parse(session.lastSavedAt)>120000
    ? 'possibly interrupted (last save is stale)' : session.state;
  const note=analysis.notes.length
    ? '<section><h2>Observations and limitations</h2><ul>'+analysis.notes.map(x=>'<li>'+htmlEscape(x)+'</li>').join('')+'</ul></section>'
    : '<p class="muted">No sustained CPU event or significant memory growth was detected in available samples. This does not prove the editor is problem-free.</p>';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);max-width:950px;margin:auto;padding:22px;line-height:1.5}
h1{margin-bottom:0}h2{font-size:1.2rem;margin-top:24px}.muted{color:var(--vscode-descriptionForeground)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:20px 0}
.metric{padding:12px;border:1px solid var(--vscode-panel-border);border-radius:8px;display:flex;flex-direction:column}
.metric strong{font-size:22px}.chart{border:1px solid var(--vscode-panel-border);border-radius:8px;padding:14px;margin:12px 0}
svg{width:100%;height:auto;max-height:230px}p{overflow-wrap:anywhere}
</style></head><body><h1>🐌 Snail Watch · Session analysis</h1>
<p class="muted">Status: ${htmlEscape(state)} · Started: ${htmlEscape(session.startedAt)} · Duration: ${Math.round(analysis.durationMs/1000)}s</p>
<p>These are <strong>aggregate CPU and RSS measurements from the Node Extension Host where Snail runs</strong>.
They do not identify an individual extension, a separate TypeScript server, or establish a memory leak.</p>
<div class="grid">
${stat('Measured intervals',String(samples))}
${stat('Missing intervals',String(analysis.gaps))}
${stat('Average CPU',fmt(analysis.meanCpu,'% of one core'))}
${stat('p95 CPU',fmt(analysis.p95Cpu,'% of one core'))}
${stat('Peak CPU',fmt(analysis.peakCpu,'% of one core'))}
${stat('Starting RSS',fmt(analysis.initialRssMiB,' MiB'))}
${stat('Peak RSS',fmt(analysis.peakRssMiB,' MiB'))}
${stat('RSS delta',fmt(analysis.rssDeltaMiB,' MiB'))}
</div>
<h2>CPU during the session</h2>${lines(session,'cpuPercentOneCore','CPU (% of one core)')}
<h2>RSS during the session</h2>${lines(session,'rssMiB','RSS (MiB)')}
${note}
<p class="muted">For component-level causality use Snail: Investigate a Performance Suspect, native profiling or a controlled experiment. Passive Watch does not perform CPU profiling or heap snapshots.</p>
</body></html>`;
}
