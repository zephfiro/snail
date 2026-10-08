import * as vscode from 'vscode';
import type { Report } from '../core/contracts';
import { TYPESCRIPT_INVESTIGATION, planForSuspect } from './investigation';
import { renderInvestigation } from './investigation-view';
import { renderExperimentVerdict } from './experiment-view';
import {
  evaluateExperiment, type EditorOperation, type EnvironmentSignature,
  type Observation, type ExperimentTrial
} from './experiments';

const BASELINE_KEY = 'snail.doctor.manual.baseline.v1';
const TRIALS_KEY = 'snail.doctor.manual.trials.v1';
const OP_LABELS: Record<EditorOperation,string> = {
  autocomplete:'Autocomplete', hover:'Hover', goToDefinition:'Go to Definition', openFile:'Open TS/TSX file'
};
function environment(): EnvironmentSignature {
  return {
    vscodeVersion:vscode.version,
    remote:Boolean(vscode.env.remoteName),
    workspaceFolderCount:vscode.workspace.workspaceFolders?.length ?? 0
  };
}
function showPanel(title:string,html:string):void {
  const panel=vscode.window.createWebviewPanel('snailDoctorInvestigation',title,vscode.ViewColumn.Active,{enableScripts:false});
  panel.webview.html=html;
}
function parseMeasurements(value:string): number[] | undefined {
  const parts=value.split(',').map(x=>x.trim());
  if (parts.length<3 || parts.length>20) return;
  const numbers=parts.map(Number);
  if (numbers.some((n,i)=>!/^\d+(\.\d+)?$/.test(parts[i]) || !Number.isFinite(n) || n<=0 || n>=3600000)) return;
  return numbers;
}
async function enterMeasurements(title:string):Promise<number[]|undefined> {
  const answer=await vscode.window.showInputBox({
    title, prompt:'Enter at least three manually measured latencies in milliseconds (comma-separated).',
    placeHolder:'250, 260, 245',ignoreFocusOut:true,
    validateInput:value=>parseMeasurements(value)?null:'Enter 3–20 positive values below 3,600,000 ms, separated by commas.'
  });
  return answer===undefined?undefined:parseMeasurements(answer);
}
function makeObservation(operation:EditorOperation,values:number[]):Observation {
  return {
    schemaVersion:1,subject:'typescript_language_server',operation,
    timestamp:new Date().toISOString(),environment:environment(),
    source:'manual_observation',measurementsMs:values
  };
}

export function registerInvestigationCommands(
  context:vscode.ExtensionContext,
  currentReport:()=>Report|undefined
):void {
  context.subscriptions.push(vscode.commands.registerCommand('snail.investigateTypeScript',()=>{
    showPanel('Snail Doctor · TypeScript Investigation',renderInvestigation(TYPESCRIPT_INVESTIGATION));
  }));
  context.subscriptions.push(vscode.commands.registerCommand('snail.investigateSuspect',async()=>{
    const suspects=currentReport()?.suspects??[];
    const options=[
      {label:'TypeScript Language Server',description:'Start a manual tsserver investigation',id:'typescript'},
      ...suspects.map(x=>({label:x.title,description:x.priorityReason,id:x.id}))
    ];
    const selected=await vscode.window.showQuickPick(options,{title:'Snail Doctor — choose a hypothesis'});
    if(!selected)return;
    const match=suspects.find(x=>x.id===selected.id);
    const plan=match?planForSuspect(match):TYPESCRIPT_INVESTIGATION;
    showPanel('Snail Doctor · '+plan.title,renderInvestigation(plan));
  }));
  context.subscriptions.push(vscode.commands.registerCommand('snail.recordBaseline',async()=>{
    const consent=await vscode.window.showInformationMessage(
      'Snail will save ONLY your manually entered timings and environment summary in workspace-local VS Code state. No code, paths or logs. Continue?',
      {modal:true},'Record baseline'
    );
    if(consent!=='Record baseline')return;
    const chosen=await vscode.window.showQuickPick(
      (Object.keys(OP_LABELS) as EditorOperation[]).map(value=>({label:OP_LABELS[value],value})),
      {title:'Choose the same operation for both measurements'}
    );
    if(!chosen)return;
    const values=await enterMeasurements('Manual baseline · '+chosen.label);
    if(!values)return;
    await context.workspaceState.update(BASELINE_KEY,makeObservation(chosen.value,values));
    void vscode.window.showInformationMessage(
      'Baseline saved locally. Change exactly one reversible variable, then run Snail: Record Comparison.'
    );
  }));
  context.subscriptions.push(vscode.commands.registerCommand('snail.recordComparison',async()=>{
    const baseline=context.workspaceState.get<Observation>(BASELINE_KEY);
    if(!baseline){
      void vscode.window.showInformationMessage('No baseline found. Run Snail: Record Baseline first.');
      return;
    }
    const values=await enterMeasurements('Manual comparison · '+OP_LABELS[baseline.operation]);
    if(!values)return;
    const chosen=await vscode.window.showQuickPick(
      [{label:'Yes — exactly one variable changed',value:true},{label:'No / unsure — several conditions changed',value:false}],
      {title:'Was exactly one configuration/plugin variable changed?'}
    );
    if(!chosen)return;
    const reversed=await vscode.window.showQuickPick(
      [{label:'Yes — I reverted and confirmed the original behavior',value:true},
       {label:'No — not yet or unverified',value:false}],
      {title:'Did you revert the change and verify the baseline behavior?'}
    );
    if(!reversed)return;
    const trial:ExperimentTrial={
      baseline,comparison:makeObservation(baseline.operation,values),
      singleChange:chosen.value,reverted:reversed.value
    };
    const saved=context.workspaceState.get<ExperimentTrial[]>(TRIALS_KEY,[]);
    const trials=[...saved,trial].slice(-4);
    await context.workspaceState.update(TRIALS_KEY,trials);
    await context.workspaceState.update(BASELINE_KEY,undefined);
    showPanel('Snail Doctor · Before/After',renderExperimentVerdict(evaluateExperiment(trials)));
  }));
  context.subscriptions.push(vscode.commands.registerCommand('snail.clearExperimentData',async()=>{
    const confirmed=await vscode.window.showWarningMessage(
      'Clear all local Snail baselines and comparison trials for this workspace?',{modal:true},'Clear local data'
    );
    if(confirmed!=='Clear local data')return;
    await context.workspaceState.update(BASELINE_KEY,undefined);
    await context.workspaceState.update(TRIALS_KEY,undefined);
    void vscode.window.showInformationMessage('Local Snail experiment data cleared.');
  }));
}
