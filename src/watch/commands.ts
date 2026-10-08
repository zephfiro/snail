import * as vscode from 'vscode';
import * as os from 'node:os';
import { randomBytes } from 'node:crypto';
import { createNodeProcessSampleSource } from '../measurements/process';
import { WatchMonitor } from './monitor';
import { LocalWatchStorage } from './storage';
import { renderVillainsExplorer } from './explorer';
import { currentExtensionMetadata } from './metadata';
import type { WatchSession } from './types';
import { MAX_WATCH_DURATION_MS, WATCH_INTERVAL_MS } from './types';

const MAX_DURATION_LABEL='2-hour safety limit';
function durationText(ms:number):string {
  const seconds=Math.floor(ms/1000);
  return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
}
function shareableSession(session: WatchSession) {
  return {
    schemaVersion:1 as const,
    startedAt:session.startedAt,
    endedAt:session.endedAt??null,
    state:session.state,
    intervalMs:session.intervalMs,
    hostScope:'Node Extension Host aggregate (not individual extensions)',
    samples:session.samples.map(sample=>sample.kind==='measured'
      ? {
        kind:'measured',timestamp:sample.timestamp,elapsedMs:sample.elapsedMs,
        cpuPercentOneCore:sample.cpuPercentOneCore,rssMiB:sample.rssMiB
      }
      : {kind:'gap',timestamp:sample.timestamp,reason:sample.reason,elapsedMs:sample.elapsedMs})
  };
}
export function registerWatchCommands(context:vscode.ExtensionContext):void {
  const store=new LocalWatchStorage(context.globalStorageUri);
  const status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right,100);
  status.name='Snail Watch';
  status.command='snail.toggleWatch';
  status.text='$(pulse) Snail Watch: OFF';
  status.tooltip='Start an opt-in CPU/RSS recording session. OFF means no sampling.';
  status.show();
  context.subscriptions.push(status);

  const monitor=new WatchMonitor({
    store,
    environment:{
      vscodeVersion:vscode.version,platform:os.platform(),
      remote:Boolean(vscode.env.remoteName),scope:'current-node-extension-host'
    },
    processSource:()=>createNodeProcessSampleSource(),
    onStatus:session=>{
      status.text=session
        ? '$(record) Snail Watch: ON · '+durationText(Date.now()-Date.parse(session.startedAt))
        : '$(pulse) Snail Watch: OFF';
      status.tooltip=session
        ? 'Recording aggregate Node Extension Host CPU/RSS every '+WATCH_INTERVAL_MS/1000+
          's. Click to Stop Watch. Stops automatically after '+MAX_DURATION_LABEL+'.'
        : 'Watch is OFF. Click to start an explicit monitoring session.';
    },
    onError:message=>void vscode.window.showWarningMessage(message)
  });
  context.subscriptions.push({dispose:()=>monitor.dispose()});

  async function openAnalysis(session:WatchSession):Promise<void> {
    const panel=vscode.window.createWebviewPanel(
      'snailWatchSession','Snail Watch · Session Analysis',vscode.ViewColumn.Active,
      {enableScripts:true,localResourceRoots:[]}
    );
    const nonce=randomBytes(16).toString('base64');
    const knownExtensions=await currentExtensionMetadata();
    if(!panel.visible)return;
    panel.webview.html=renderVillainsExplorer(session,{
      nonce,cspSource:panel.webview.cspSource,knownExtensions
    });
  }
  async function chooseSession(title:string):Promise<WatchSession|undefined> {
    const sessions=await store.list();
    if(!sessions.length){
      void vscode.window.showInformationMessage('No Snail Watch sessions saved. Start Watch to collect measurements.');
      return;
    }
    const selection=await vscode.window.showQuickPick(sessions.map(session=>({
      label:new Date(session.startedAt).toLocaleString(),
      description:(session.state==='recording'?'recording/possibly interrupted':session.state)+
        ' · '+session.samples.length+' samples',
      detail:'Aggregate Extension Host CPU/RSS · '+session.id.slice(0,8),
      session
    })),{title,placeHolder:'Select a recorded session to view offline'});
    return selection?.session;
  }
  async function startWatch():Promise<void> {
    if(monitor.active){
      void vscode.window.showInformationMessage('Snail Watch is already recording. Use Snail: Stop Watch.');
      return;
    }
    const duration=await vscode.window.showQuickPick([
      {label:'Until I stop (maximum 2 hours)',ms:MAX_WATCH_DURATION_MS},
      {label:'15 minutes',ms:15*60000},
      {label:'30 minutes',ms:30*60000},
      {label:'60 minutes',ms:60*60000}
    ],{
      title:'Start Snail Watch · explicit local monitoring',
      placeHolder:'Sample this Node Extension Host only; no extension-level CPU attribution'
    });
    if(!duration)return;
    try {
      await monitor.start(duration.ms);
      void vscode.window.showInformationMessage(
        'Snail Watch ON. Recording aggregate CPU/RSS locally until stopped or the duration limit is reached.'
      );
    } catch {
      void vscode.window.showErrorMessage('Unable to start Snail Watch. Check local storage and Node Extension Host availability.');
    }
  }
  async function stopWatch():Promise<void> {
    if(!monitor.active){
      void vscode.window.showInformationMessage('Snail Watch is already OFF. You can open saved sessions.');
      return;
    }
    try {
      const session=await monitor.stop();
      const choice=await vscode.window.showInformationMessage(
        'Snail Watch OFF. Session saved locally; no more samples are being recorded.',
        'Analyze now','Later'
      );
      if(choice==='Analyze now'&&session)await openAnalysis(session);
    }catch{
      void vscode.window.showErrorMessage('Watch stopped, but the final session could not be saved. Data may be incomplete.');
    }
  }
  context.subscriptions.push(
    vscode.commands.registerCommand('snail.startWatch',startWatch),
    vscode.commands.registerCommand('snail.stopWatch',stopWatch),
    vscode.commands.registerCommand('snail.toggleWatch',async()=>{
      if(monitor.active)await stopWatch();
      else await startWatch();
    }),
    vscode.commands.registerCommand('snail.openWatchSessions',async()=>{
      const session=await chooseSession('Snail Watch · saved monitoring sessions');
      if(session)await openAnalysis(session);
    }),
    vscode.commands.registerCommand('snail.exportWatchSession',async()=>{
      const session=await chooseSession('Export a Snail Watch session');
      if(!session)return;
      const uri=await vscode.window.showSaveDialog({
        filters:{'JSON':['json']},
        saveLabel:'Export aggregate monitoring data'
      });
      if(!uri)return;
      await vscode.workspace.fs.writeFile(uri,Buffer.from(JSON.stringify(shareableSession(session),null,2),'utf8'));
      void vscode.window.showInformationMessage('Snail Watch session exported locally. Review before sharing.');
    }),
    vscode.commands.registerCommand('snail.clearWatchHistory',async()=>{
      if(monitor.active){
        void vscode.window.showWarningMessage('Stop Snail Watch before clearing monitoring history.');
        return;
      }
      const confirmed=await vscode.window.showWarningMessage(
        'Delete all locally saved Snail Watch sessions? This cannot be undone.',
        {modal:true},'Delete all Watch sessions'
      );
      if(confirmed!=='Delete all Watch sessions')return;
      const sessions=await store.list();
      await Promise.all(sessions.map(x=>store.delete(x.id)));
      void vscode.window.showInformationMessage('Local Snail Watch history cleared.');
    })
  );
}
