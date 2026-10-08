import { escapeHtml } from '../report-view';
import type { ExperimentVerdict } from './experiments';
export function renderExperimentVerdict(verdict: ExperimentVerdict): string {
  const rows=verdict.trialResults.map((trial,index) =>
    '<tr><th scope="row">' + (index+1) + '</th><td>' +
      (trial.baselineMedianMs ?? '—') + '</td><td>' +
      (trial.comparisonMedianMs ?? '—') + '</td><td>' +
      (trial.changePercent===undefined?'N/A':trial.changePercent+'%') + '</td><td>' +
      escapeHtml(trial.reason) + '</td></tr>').join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<meta name="viewport" content="width=device-width,initial-scale=1"><style>
body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);max-width:900px;margin:auto;padding:20px;line-height:1.6}
table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid var(--vscode-panel-border);padding:8px;text-align:left}
.muted{color:var(--vscode-descriptionForeground)}
</style></head><body><h1>Snail Doctor · Comparison</h1>
<p><strong>Verdict:</strong> ${escapeHtml(verdict.status.replace(/_/g,' '))}</p>
<p>${escapeHtml(verdict.explanation)}</p><table><thead><tr><th>Trial</th><th>Baseline median (ms)</th><th>After median (ms)</th><th>Change</th><th>Limitations</th></tr></thead><tbody>${rows}</tbody></table>
<p class="muted">Changes are relative to the baseline median. Manual measurements are self-reported, not CPU statistics or proof that tsserver caused the slowdown.</p></body></html>`;
}
