import * as vscode from 'vscode';
import { diagnose, Report } from './diagnostics';
import { renderReport } from './report-view';

let latestReport: Report | undefined;
function show(report: Report): void {
  const panel = vscode.window.createWebviewPanel('snailDoctor', 'Snail Doctor', vscode.ViewColumn.Active, { enableScripts: false });
  panel.webview.html = renderReport(report);
}
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand('snail.diagnose', async () => {
    const report = await vscode.window.withProgress({
      location:vscode.ProgressLocation.Notification, title:'Snail Doctor: diagnosing', cancellable:true
    }, (_progress, token) => diagnose(token));
    latestReport = report;
    show(report);
  }));
  context.subscriptions.push(vscode.commands.registerCommand('snail.exportReport', async () => {
    if (!latestReport) { void vscode.window.showInformationMessage('Run Snail: Diagnose Performance first.'); return; }
    const uri = await vscode.window.showSaveDialog({filters:{'JSON':['json']},saveLabel:'Export diagnostic report'});
    if (!uri) return;
    // Reports contain no file paths and no file contents. Warnings may contain system errors; omit them from export.
    const safe: Report = {...latestReport, warnings: []};
    await vscode.workspace.fs.writeFile(uri, Buffer.from(JSON.stringify(safe, null, 2), 'utf8'));
    void vscode.window.showInformationMessage('Snail Doctor report exported.');
  }));
}
export function deactivate(): void {}
