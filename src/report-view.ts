import type { Finding, Report } from './diagnostics';

export function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  };
  return value.replace(/[&<>"']/g, character => entities[character]);
}

export function renderFinding(finding: Finding): string {
  return `<article><h3>${escapeHtml(finding.title)}</h3><div class="meta">${escapeHtml(finding.severity)} · ${escapeHtml(finding.confidence)} · ${escapeHtml(finding.category)}</div><p>${escapeHtml(finding.evidence)}</p><p><strong>Next step:</strong> ${escapeHtml(finding.recommendation)}</p></article>`;
}

/**
 * The local panel may show extension identifiers. The JSON export explicitly
 * omits this section because internal or unpublished IDs can be sensitive.
 */
export function renderInventory(report: Report): string {
  const inventory = report.extensionInventory;
  if (!inventory) {
    return '<h2>Installed extensions</h2><p class="muted">Extension inventory unavailable.</p>';
  }
  const maximumVisible = 250;
  const visible = inventory.slice(0, maximumVisible);
  const lines = visible.map(entry => {
    const label = escapeHtml(entry.displayName);
    const id = escapeHtml(entry.id);
    const version = escapeHtml(entry.version ?? 'unknown');
    const group = entry.isBuiltin ? 'Built-in' : 'Third-party';
    const status = entry.isActive ? 'Activated' : 'Not activated';
    const kind = entry.extensionKind === 'ui' ? 'UI kind' :
      entry.extensionKind === 'workspace' ? 'Workspace kind' : 'Unknown kind';
    return '<tr><th scope="row">' + label + '<span class="meta">' + id +
      '</span></th><td>' + version + '</td><td>' + group + '</td><td>' +
      status + '</td><td>' + kind + '</td></tr>';
  });
  const omitted = inventory.length > visible.length
    ? '<p class="muted">Showing ' + visible.length + ' of ' + inventory.length +
      ' entries to keep the panel lightweight.</p>'
    : '';
  const table = inventory.length === 0
    ? '<p>No extensions were found in this snapshot.</p>'
    : '<div class="table-scroll"><table><thead><tr><th>Extension</th><th>Version</th>' +
      '<th>Origin</th><th>Activation</th><th>Kind</th></tr></thead><tbody>' +
      lines.join('') + '</tbody></table></div>' + omitted;
  return '<details><summary>Installed extensions (' + inventory.length +
    ' total; ' + report.summary.installedExtensions + ' third-party)</summary>' +
    '<p class="muted">Snapshot from public VS Code APIs. “Activated” does not mean slow. ' +
    'UI/Workspace kind does not prove which local, remote or web host is executing the extension. ' +
    'Identifiers and versions below stay in this local panel; they are excluded from JSON exports.</p>' +
    table + '</details>';
}

export function renderReport(report: Report): string {
  const { summary, process } = report;
  const warnings = report.warnings.length
    ? '<h2>Warnings</h2><ul>' + report.warnings.map(warning => '<li>' + escapeHtml(warning) + '</li>').join('') + '</ul>'
    : '';
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <meta name="viewport" content="width=device-width, initial-scale=1"><style>
  body{font-family:var(--vscode-font-family);color:var(--vscode-foreground);padding:24px;max-width:880px;margin:auto;line-height:1.55}
  h1{margin-bottom:0}.muted,.meta{color:var(--vscode-descriptionForeground)}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(175px,1fr));gap:12px;margin:24px 0}
  article,.tile{border:1px solid var(--vscode-panel-border);border-radius:10px;padding:16px;margin-bottom:12px}
  .tile b{display:block;font-size:24px}.meta{font-size:12px;text-transform:uppercase;letter-spacing:.06em}
  h3{margin-top:0}p{overflow-wrap:anywhere}details{margin:20px 0}summary{cursor:pointer;font-weight:600} .table-scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:12px}td,th{border-bottom:1px solid var(--vscode-panel-border);padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th .meta{display:block;max-width:340px;word-break:break-all}td{white-space:nowrap}
  </style></head><body><h1>🐌 Snail Doctor</h1>
  <p class="muted">On-demand diagnosis · ${escapeHtml(report.timestamp)}</p>
  <div class="grid"><div class="tile"><b>${summary.installedExtensions}</b>Installed extensions</div>
  <div class="tile"><b>${summary.activeExtensions}</b>Active extensions</div>
  <div class="tile"><b>${summary.scannedEntries}</b>Scanned entries</div>
  <div class="tile"><b>${process ? process.cpuPercentOneCore + '%' : 'N/A'}</b>Host process CPU (one core)</div>
  <div class="tile"><b>${process ? process.rssMb + ' MB' : 'N/A'}</b>Host process RSS</div></div>
  <p class="muted">CPU: ${process ? escapeHtml(String(process.cpuPercentOneCore)) + '% of one full CPU core over ' + escapeHtml(String(process.samplingMs)) + 'ms' : 'sample unavailable'}. Values above 100% are possible. RSS is a point-in-time process memory snapshot. ${process ? escapeHtml(process.scope) : 'No process metrics were collected.'}</p>
  <h2>Findings</h2>${report.findings.map(renderFinding).join('')}
  ${renderInventory(report)}
  <h2>Collection limitations</h2><p>The VS Code API cannot directly report individual extensions' CPU or memory.
  Process readings are aggregate samples and cannot be treated as per-extension figures.
  Directory scan is bounded and does not read file contents.</p>
  ${warnings}
  <p class="muted">Use Command Palette → Snail: Export Last Report to save a JSON copy.</p>
  </body></html>`;
}
