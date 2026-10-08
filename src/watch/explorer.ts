import type { WatchSession, WatchSample } from './types';
import { analyzeWatchSession } from './analysis';

/** An extension-specific series MUST carry its own evidence source. */
export interface ExplorerSeries {
  id: string;
  name: string;
  publisher?: string;
  icon?: string;
  confidence: 'measured' | 'estimated' | 'unavailable';
  /** The unit must NEVER be confused with % of one core. */
  unit: 'cpu-profile-share' | 'rss-mib';
  source: string;
  points: readonly { time: number; value: number }[];
}
export interface ExplorerExtensionMetadata {
  id:string;
  name:string;
  publisher?:string;
  version?:string;
  icon?:string;
  activeNow:boolean;
}
export interface ExplorerOptions {
  nonce: string;
  cspSource?: string;
  cpuSeries?: readonly ExplorerSeries[];
  ramSeries?: readonly ExplorerSeries[];
  knownExtensions?: readonly ExplorerExtensionMetadata[];
}
const safe=(input:string)=>input.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const number=(v:number|undefined,unit='')=>v===undefined?'N/A':Math.round(v*10)/10+unit;
const colors=['#8b9dff','#fd9974','#60d5b0','#ef83c3','#e8bf69','#83c5ff','#bd9ef8','#93cd82','#f3a0a7','#61c7c6'];
export function seriesColor(id:string):string {
  let hash=2166136261;
  for(let i=0;i<id.length;i++)hash=Math.imul(hash^id.charCodeAt(i),16777619);
  return colors[(hash>>>0)%colors.length];
}
const valid=(series:ExplorerSeries,kind:'cpu'|'ram')=>
  (kind==='cpu'?series.unit==='cpu-profile-share':series.unit==='rss-mib') &&
  series.confidence!=='unavailable' && series.points.length>0 &&
  series.points.every(p=>Number.isFinite(p.time)&&Number.isFinite(p.value)&&p.time>=0&&p.value>=0);
const toJSON=(value:unknown)=>JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,c=>
  '\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
function hostPoints(session:WatchSession,metric:'cpuPercentOneCore'|'rssMiB') {
  const origin=Date.parse(session.startedAt);
  return session.samples.map(sample=>sample.kind==='gap'
    ? null
    : {time:Math.max(0,Date.parse(sample.timestamp)-origin),value:sample[metric]});
}
export function renderVillainsExplorer(session:WatchSession,options:ExplorerOptions):string {
  const analysis=analyzeWatchSession(session);
  const cpu=(options.cpuSeries??[]).filter(s=>valid(s,'cpu'));
  const ram=(options.ramSeries??[]).filter(s=>valid(s,'ram'));
  const metadata=new Map((options.knownExtensions??[]).map(e=>[e.id.toLowerCase(),e]));
  const names=[...new Map([...cpu,...ram].map(s=>{
    const entry=metadata.get(s.id.toLowerCase());
    return [s.id,{id:s.id,name:entry?.name??s.name,confidence:s.confidence,
      color:seriesColor(s.id),icon:entry?.icon??s.icon??''}] as const;
  })).values()];
  const known=(options.knownExtensions??[]).slice(0,24);
  const safeIcon=(icon?:string)=>icon&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(icon)
    ? '<img class="exticon" alt="" src="'+safe(icon)+'">' : '<span class="fallback">◇</span>';
  const inventory=known.map(entry=>'<div class="extension">'+safeIcon(entry.icon)+
    '<div><strong>'+safe(entry.name)+'</strong><small>'+safe(entry.version??'Version unavailable')+
    ' · '+(entry.activeNow?'Active now':'Inactive now')+'</small></div></div>').join('');
  // Data from the extension process is treated as untrusted before interpolation.
  const data=toJSON({
    host:{cpu:hostPoints(session,'cpuPercentOneCore'),ram:hostPoints(session,'rssMiB')},
    cpu:cpu.map(s=>({...s,icon:undefined,points:s.points.slice(0,2000)})),
    ram:ram.map(s=>({...s,icon:undefined,points:s.points.slice(0,2000)})),
    names,
    intervalMs:session.intervalMs
  });
  const nonce=safe(options.nonce);
  const csp=options.cspSource?'; img-src '+safe(options.cspSource)+' data:':'';
  const list=names.map(s=>'<button type="button" class="chip" data-id="'+safe(s.id)+'" aria-pressed="true">'+
    '<span class="dot" style="--series-color:'+s.color+'"></span>'+safeIcon(s.icon)+safe(s.name)+'</button>').join('');
  const card=(label:string,val:string,hint:string)=>'<article class="metric"><div class="label">'+safe(label)+'</div><strong>'+
    safe(val)+'</strong><small>'+safe(hint)+'</small></article>';
  const state=session.state==='recording'?'Recording / potentially interrupted':session.state;
  const notes=analysis.notes.length?analysis.notes.map(n=>'<li>'+safe(n)+'</li>').join(''):
    '<li>No sustained anomaly found in the sampled host data. Absence of evidence is not a clean bill of health.</li>';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'${csp}">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style nonce="${nonce}">
:root{color-scheme:dark light}*{box-sizing:border-box}body{font-family:var(--vscode-font-family,system-ui);color:var(--vscode-foreground);background:var(--vscode-editor-background);margin:0;padding:26px;line-height:1.45}
main{max-width:1250px;margin:auto}header{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px}h1{font-size:26px;letter-spacing:-.7px;margin:0}h2{font-size:16px;margin:0 0 8px}.muted,.label,small{color:var(--vscode-descriptionForeground)}.eyebrow{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8b9dff;font-weight:700}
.hero{background:linear-gradient(115deg,rgba(121,111,252,.12),rgba(42,160,169,.04));border:1px solid var(--vscode-panel-border);border-radius:17px;padding:22px;margin-bottom:20px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px;margin:16px 0 24px}.metric,.panel{border:1px solid var(--vscode-panel-border);border-radius:13px;background:var(--vscode-sideBar-background,var(--vscode-editor-background))}
.metric{padding:17px;min-height:110px}.metric strong{font-size:24px;display:block;margin:8px 0 4px;letter-spacing:-.7px}.metric small{display:block;font-size:11px}.label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px}
.panel{padding:19px;margin:15px 0}.panelhead{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:14px}.pill{font-size:11px;border-radius:99px;padding:5px 10px;background:rgba(139,157,255,.13);color:var(--vscode-foreground)}.toolbar{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin:18px 0}.toolbar button,.chip{background:var(--vscode-button-secondaryBackground);color:var(--vscode-button-secondaryForeground);border:1px solid var(--vscode-panel-border);border-radius:8px;padding:8px 12px;cursor:pointer}.toolbar button[aria-pressed=true],.chip[aria-pressed=true]{border-color:#8b9dff;box-shadow:inset 0 0 0 1px #8b9dff}.toolbar input{background:var(--vscode-input-background);color:var(--vscode-input-foreground);border:1px solid var(--vscode-input-border,var(--vscode-panel-border));padding:9px 11px;border-radius:8px;min-width:165px;flex:1;max-width:300px}.chips{display:flex;flex-wrap:wrap;gap:7px;margin:13px 0}.chip{font-size:12px;display:inline-flex;gap:7px;align-items:center}.chip[aria-pressed=false]{opacity:.5}.dot{height:10px;width:10px;background:var(--series-color);border-radius:50%}.exticon{width:20px;height:20px;object-fit:contain;border-radius:5px}.fallback{width:20px;height:20px;display:inline-grid;place-items:center;background:rgba(139,157,255,.15);border-radius:5px}.extension{display:flex;align-items:center;gap:10px;min-width:180px;max-width:250px}.extension strong{font-size:12px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.extension small{display:block;font-size:10px}.inventory{display:grid;grid-template-columns:repeat(auto-fit,minmax(185px,1fr));gap:13px;margin-top:14px}
.graph{min-height:220px;position:relative}svg{width:100%;height:auto;max-height:290px;display:block;overflow:visible}svg path,svg polyline{vector-effect:non-scaling-stroke}.empty{border:1px dashed var(--vscode-panel-border);border-radius:10px;padding:22px;text-align:center;color:var(--vscode-descriptionForeground)}
.legend{display:flex;flex-wrap:wrap;gap:14px;font-size:11px;color:var(--vscode-descriptionForeground);margin-top:12px}.legend span{display:inline-flex;gap:6px;align-items:center}
.legend b{height:3px;width:17px;display:inline-block;background:var(--series-color)}.note{font-size:12px;color:var(--vscode-descriptionForeground)}.tooltip{position:fixed;pointer-events:none;display:none;max-width:320px;padding:9px 12px;background:var(--vscode-editorHoverWidget-background,var(--vscode-sideBar-background));color:var(--vscode-editorHoverWidget-foreground,var(--vscode-foreground));border:1px solid var(--vscode-editorHoverWidget-border,var(--vscode-panel-border));border-radius:8px;font-size:12px;z-index:4;box-shadow:0 5px 20px #0005;white-space:pre-line}
ul{padding-left:20px}.callout{border-left:3px solid #8b9dff;padding:12px;background:rgba(139,157,255,.07);border-radius:5px;font-size:13px}
button:focus-visible,input:focus-visible{outline:2px solid var(--vscode-focusBorder,#8b9dff);outline-offset:2px}
</style></head><body><main>
<div class="hero"><header><div><div class="eyebrow">SNAIL / WATCH / SESSION INTELLIGENCE</div><h1>🐌 Villains Explorer</h1></div><span class="pill">${safe(state)} · ${Math.round(analysis.durationMs/1000)}s monitored</span></header>
<p class="muted">Discover when the editor was busy, then investigate plausible causes. Extension CPU attribution requires an explicitly imported profile; RAM attribution is unavailable unless independently measured.</p></div>
<section class="grid" aria-label="Aggregate host measurements">
${card('Host avg CPU',number(analysis.meanCpu,'%'),'One CPU core · measured')}
${card('Host peak CPU',number(analysis.peakCpu,'%'),'One CPU core · measured')}
${card('Host peak RSS',number(analysis.peakRssMiB,' MiB'),'Shared process memory')}
${card('RSS change',number(analysis.rssDeltaMiB,' MiB'),'Host, not per extension')}
${card('Samples',String(analysis.sampleCount),'Measured intervals')}
${card('Gaps',String(analysis.gaps),'Not interpolated')}
</section>
<div class="toolbar" role="group" aria-label="Filter extension series">
<button type="button" data-top="5" aria-pressed="true">Top 5</button>
<button type="button" data-top="10" aria-pressed="false">Top 10</button>
<button type="button" data-top="all" aria-pressed="false">All</button>
<input id="search" type="search" aria-label="Search extensions" placeholder="Find an extension...">
<button type="button" id="showAll">Show all</button>
</div>
<div id="chips" class="chips" aria-label="Click to show or hide an extension">${list}</div>
${names.length?'':'<p class="note">No extension-level evidence is attached to this session. Use Import CPU Profile to add attributed sampling evidence; Snail never creates fake extension lines.</p>'}
<section class="panel" aria-labelledby="cpuTitle"><div class="panelhead"><div><h2 id="cpuTitle">CPU · timeline</h2><div class="note">Host usage: % of one core. Extension profiles: % of sampled CPU stack time (separate scale).</div></div><span class="pill">CPU</span></div>
<div class="graph" id="cpuChart"></div><div class="legend" id="cpuLegend"></div><p class="note" id="cpuNote"></p></section>
<section class="panel" aria-labelledby="ramTitle"><div class="panelhead"><div><h2 id="ramTitle">Memory · RSS timeline</h2><div class="note">MiB. Extension-level RAM is not inferred from shared-process RSS.</div></div><span class="pill">RAM</span></div>
<div class="graph" id="ramChart"></div><div class="legend" id="ramLegend"></div><p class="note" id="ramNote"></p></section>
<section class="panel"><h2>Extensions installed now</h2><p class="note">Names, icons and activation state reflect the current VS Code window, not which extensions ran during this saved session. No per-extension resource figures are implied.</p><div class="inventory">${inventory||'<p class="note">No local extension metadata available.</p>'}</div></section>
<section class="panel"><h2>Evidence & limitations</h2><div class="callout">A colorful chart is not a verdict. CPU profile sample-share is an estimate of sampled execution time, not measured CPU percent of one core. No RAM is assigned to individual extensions without a verified source.</div><ul>${notes}</ul></section>
<div id="tooltip" class="tooltip" role="status" aria-live="polite"></div>
</main><script nonce="${nonce}">
const evidence=${data};
const NS='http://www.w3.org/2000/svg';
const visible=new Set(evidence.names.map(s=>s.id));
let top=5,search='';
const byId=id=>document.getElementById(id);
const el=(name,attrs={})=>{const node=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,String(v));return node;};
const hostSeries=(kind)=>({id:'__host',name:'Node Extension Host',color:kind==='cpu'?'#94a3b8':'#57c5b6',points:evidence.host[kind],unit:kind==='cpu'?'% of one core':'MiB',confidence:'measured'});
function draw(kind){
  const target=byId(kind+'Chart');target.replaceChildren();
  const available=evidence[kind].filter(s=>visible.has(s.id)&&s.name.toLowerCase().includes(search));
  const sorted=available.sort((a,b)=>Math.max(...b.points.map(p=>p.value),0)-Math.max(...a.points.map(p=>p.value),0));
  const items=(top==='all'?sorted:sorted.slice(0,Number(top)));
  const host=hostSeries(kind);
  const onlyHost=(evidence[kind].length===0);
  const w=920,h=258,margin={l:54,r:16,t:18,b:30};
  // CPU profile sample-share uses a separate coordinate scale from host core percentage.
  // Never plot both on one shared unlabeled axis.
  const chartSets=kind==='cpu'&&items.length
    ? [{label:'Host · % of one core',series:[host],height:130,top:12},{label:'Profile sample-share · %',series:items,height:130,top:151}]
    : [{label:kind==='cpu'?'% of one core':'MiB',series:[host,...items],height:225,top:12}];
  const svg=el('svg',{viewBox:'0 0 920 '+(chartSets.length===2?'328':'258'),role:'img','aria-label':kind.toUpperCase()+' session timeline with '+items.length+' attributed extension series'});
  const all=[...host.points.filter(Boolean),...items.flatMap(s=>s.points)];
  const maxTime=Math.max(1,...all.map(p=>p.time));
  for(const grp of chartSets){
    const chartTop=grp.top,chartBottom=grp.top+grp.height-26;
    const seriesValues=grp.series.flatMap(s=>s.points.filter(Boolean).map(p=>p.value));
    const min=Math.min(0,...seriesValues),max=Math.max(1,...seriesValues),range=max-min;
    // Profile-relative buckets and Watch session wall time have separate origins.
    const groupTime=Math.max(1,...grp.series.flatMap(s=>s.points.filter(Boolean).map(p=>p.time)));
    const x=t=>margin.l+t/groupTime*(w-margin.l-margin.r);
    const y=v=>chartBottom-(v-min)/range*(chartBottom-chartTop-15);
    for(let i=0;i<=3;i++){
      const v=min+(max-min)*(i/3);
      svg.append(el('line',{x1:margin.l,x2:w-margin.r,y1:y(v),y2:y(v),stroke:'currentColor','stroke-opacity':'.13'}));
      const tx=el('text',{x:margin.l-9,y:y(v)+4,fill:'currentColor','fill-opacity':'.7','font-size':11,'text-anchor':'end'});tx.textContent=String(Math.round(v*10)/10);svg.append(tx);
    }
    const name=el('text',{x:margin.l,y:chartTop+8,fill:'currentColor','fill-opacity':'.65','font-size':11});name.textContent=grp.label;svg.append(name);
    for(const s of grp.series){
      let chunk=[];
      const flush=()=>{
        if(chunk.length>1){svg.append(el('polyline',{points:chunk.join(' '),fill:'none',stroke:s.color||evidence.names.find(n=>n.id===s.id)?.color||'#8b9dff','stroke-width':2.1,'stroke-linecap':'round','stroke-linejoin':'round'}));}
        else if(chunk.length){let [cx,cy]=chunk[0].split(',');svg.append(el('circle',{cx,cy,r:2.5,fill:s.color||'#8b9dff'}));}
        chunk=[];
      };
      for(const p of s.points){if(!p){flush();continue;}chunk.push(x(p.time).toFixed(1)+','+y(p.value).toFixed(1));}flush();
    }
  }
  const axis=el('text',{x:w/2,y:chartSets.length===2?319:253,fill:'currentColor','fill-opacity':'.65','font-size':11,'text-anchor':'middle'});axis.textContent='Elapsed time · '+(maxTime/1000).toFixed(0)+' seconds';svg.append(axis);
  target.append(svg);
  const legend=byId(kind+'Legend');legend.replaceChildren();
  for(const s of [host,...items]){
    const item=document.createElement('span');
    const dash=document.createElement('b');dash.style.setProperty('--series-color',s.color||evidence.names.find(n=>n.id===s.id)?.color||'#8b9dff');
    item.append(dash,document.createTextNode(s.name));legend.append(item);
  }
  byId(kind+'Note').textContent=onlyHost
    ? 'Only host-level measurements exist for this session. No per-extension '+(kind==='cpu'?'CPU profile':'RAM readings')+' available.'
    : kind==='cpu'?'Profile-derived lines are relative sampled shares, NOT host core CPU usage. Timelines may have different origins.'
    : 'Only independently attributed RAM series are displayed; host RSS cannot be divided among extensions.';
}
function redraw(){
  for(const kind of ['cpu','ram'])draw(kind);
  document.querySelectorAll('.chip').forEach(btn=>{
    const id=btn.dataset.id;
    btn.setAttribute('aria-pressed',String(visible.has(id)));
    btn.hidden=!btn.textContent.toLowerCase().includes(search);
  });
  document.querySelectorAll('[data-top]').forEach(btn=>btn.setAttribute('aria-pressed',String(btn.dataset.top===String(top))));
}
document.querySelectorAll('.chip').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.id;if(visible.has(id))visible.delete(id);else visible.add(id);redraw();}));
document.querySelectorAll('[data-top]').forEach(button=>button.addEventListener('click',()=>{top=button.dataset.top;redraw();}));
byId('search').addEventListener('input',event=>{search=event.target.value.trim().toLowerCase();redraw();});
byId('showAll').addEventListener('click',()=>{visible.clear();for(const s of evidence.names)visible.add(s.id);search='';byId('search').value='';redraw();});
redraw();
</script></body></html>`;
}
