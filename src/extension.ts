import * as vscode from 'vscode';
import { diagnose, Report, Finding } from './diagnostics';

let latestReport: Report | undefined;
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]!));
}
function renderFinding(f: Finding): string {
  return `<article><h3>${escapeHtml(f.title)}</h3><div class="meta">${escapeHtml(f.severity)} · ${escapeHtml(f.confidence)} · ${escapeHtml(f.category)}</div><p>${escapeHtml(f.evidence)}</p><p><strong>Next step:</strong> ${escapeHtml(f.recommendation)}</p></article>`;
}
function show(report: Report): void {
  const panel = vscode.window.createWebviewPanel('snailDoctor', 'Snail Doctor', vscode.ViewColumn.Active, {enableScripts:false});
  const {summary, process} = report;
  panel.webview.html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:24px;max-width:880px;margin:auto;line-height:1.55}h1{margin-bottom:0}.muted,.meta{color:var(--vscode-descriptionForeground)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px;margin:24px 0}article,.tile{border:1px solid var(--vscode-panel-border);border-radius:10px;padding:16px;margin-bottom:12px}.tile b{display:block;font-size:24px}.meta{font-size:12px;text-transform:uppercase;letter-spacing:.06em}h3{margin-top:0}p{overflow-wrap:anywhere}
  </style></head><body><h1>🐌 Snail Doctor</h1><p class="muted">On-demand diagnosis · ${escapeHtml(report.timestamp)}</p>
  <div class="grid"><div class="tile"><b>${summary.installedExtensions}</b>Installed extensions</div><div class="tile"><b>${summary.activeExtensions}</b>Active extensions</div><div class="tile"><b>${summary.scannedEntries}</b>Scanned entries</div><div class="tile"><b>${process ? process.rssMb + ' MB' : 'N/A'}</b>Host process RSS</div></div>
  <h2>Findings</h2>${report.findings.map(renderFinding).join('')}
  <h2>Collection limitations</h2><p>The VS Code API cannot directly report individual extensions' CPU or memory. Process readings are aggregate samples and cannot be treated as per-extension figures. Directory scan is bounded and does not read file contents.</p>
  ${report.warnings.length ? '<h2>Warnings</h2><ul>' + report.warnings.map(w => '<li>' + escapeHtml(w) + '</li>').join('') + '</ul>' : ''}
  <p class="muted">Use Command Palette → Snail: Export Last Report to save a JSON copy.</p></body></html>`;
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
