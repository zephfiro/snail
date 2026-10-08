import { escapeHtml } from '../report-view';
import type { InvestigationPlan } from './investigation';

export function renderInvestigation(plan: InvestigationPlan): string {
  const list = plan.steps.map(step => '<li><h2>' + escapeHtml(step.title) +
    '</h2><p>' + escapeHtml(step.instructions) + '</p><p><strong>Observe:</strong> ' +
    escapeHtml(step.observation) + '</p>' + (step.reversal
      ? '<p><strong>Undo:</strong> ' + escapeHtml(step.reversal) + '</p>' : '') +
    '</li>').join('');
  const limitations = plan.limitations.map(l => '<li>' + escapeHtml(l) + '</li>').join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <meta name="viewport" content="width=device-width, initial-scale=1"><style>
  body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);line-height:1.6;max-width:850px;margin:auto;padding:24px}
  h1{margin-bottom:4px}h2{font-size:1.1rem}li{padding-bottom:10px}ol li{border-bottom:1px solid var(--vscode-panel-border)}
  .muted{color:var(--vscode-descriptionForeground)}p{overflow-wrap:anywhere}
  </style></head><body><h1>${escapeHtml(plan.title)}</h1>
  <p class="muted">Guided, on-demand investigation. No automatic changes or process attribution.</p>
  <p><strong>Hypothesis:</strong> ${escapeHtml(plan.hypothesis)}</p>
  <p><strong>Evidence needed:</strong> ${escapeHtml(plan.evidenceRequired)}</p>
  <ol>${list}</ol>
  <h2>Limitations</h2><ul>${limitations}</ul>
  <p>Use the Command Palette to run <strong>Snail: Record Baseline</strong>
  and <strong>Snail: Record Comparison</strong> when you are ready to compare a manual experiment.</p>
  </body></html>`;
}
