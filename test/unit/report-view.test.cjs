const test = require('node:test');
const assert = require('node:assert/strict');
const { escapeHtml, renderFinding, renderReport } = require('../../dist/report-view.js');

const finding = overrides => ({
  id: 'injected', title: 'Watchers',
  category: 'workspace', severity: 'warning', confidence: 'inferred',
  evidence: 'Found generated directories',
  recommendation: 'Check settings',
  ...overrides
});

test('escapeHtml escapes five HTML-significant characters', () => {
  assert.equal(escapeHtml(`<&>"'`), '&lt;&amp;&gt;&quot;&#39;');
});

test('renderFinding keeps severity and evidence while escaping every interpolated field', () => {
  const result = renderFinding(finding({
    title: '<script>alert(1)</script>',
    evidence: '<img src=x onerror=alert(1)>',
    recommendation: '" onclick="bad()"'
  }));
  assert.match(result, /inferred/);
  assert.match(result, /warning/);
  assert.doesNotMatch(result, /<script>|<img/);
  assert.match(result, /&lt;script&gt;/);
  assert.match(result, /&quot; onclick=&quot;/);
});

test('renderReport shows findings and warnings with a restrictive CSP', () => {
  const report = {
    schemaVersion: 1, timestamp: '2026-10-08T00:00:00.000Z',
    environment: { vscodeVersion: '1.94.0', platform: 'linux', remote: false },
    summary: { installedExtensions: 2, activeExtensions: 1, scannedEntries: 5, limitReached: false },
    findings: [finding({ confidence: 'measured' }), finding({ confidence: 'informational' })],
    warnings: ['<svg onload=alert(1)>']
  };
  const html = renderReport(report);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /measured/);
  assert.match(html, /informational/);
  assert.match(html, /2<\/b>Installed extensions/);
  assert.doesNotMatch(html, /<svg/);
  assert.match(html, /&lt;svg/);
});

test('local extension inventory displays escaped metadata and activation without CPU attribution', () => {
  const report = {
    schemaVersion: 1, timestamp: '2026-10-08T12:00:00Z',
    environment: { vscodeVersion: '1.94', platform: 'linux', remote: false },
    summary: { installedExtensions: 1, activeExtensions: 1, scannedEntries: 0, limitReached: false },
    findings: [], warnings: [], collectors: [],
    extensionInventory: [
      { id: 'private.<one>', displayName: '<img src=x onerror=alert(1)>',
        version: '1.2.3<script>', isActive: true, isBuiltin: false, extensionKind: 'workspace' },
      { id: 'vscode.git', displayName: 'Git', version: undefined,
        isActive: false, isBuiltin: true, extensionKind: 'ui' }
    ]
  };
  const html = renderReport(report);
  assert.match(html, /Installed extensions \(2 total; 1 third-party\)/);
  assert.match(html, /Activated/);
  assert.match(html, /Not activated/);
  assert.match(html, /Workspace kind/);
  assert.match(html, /unknown/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /private\.&lt;one&gt;/);
  assert.doesNotMatch(html, /<img src=x|<script>/);
  assert.match(html, /does not mean slow/);
});

test('large inventories are capped in the Webview without losing their total', () => {
  const entries = Array.from({ length: 265 }, (_, n) => ({
    id: 'publisher.extension' + n, displayName: 'Extension ' + n,
    version: '1.0', isActive: false, isBuiltin: false, extensionKind: 'unknown'
  }));
  const html = renderReport({
    schemaVersion: 1, timestamp: '2026-10-08T12:00:00Z',
    environment: { vscodeVersion: '1.94', platform: 'linux', remote: false },
    summary: { installedExtensions: 265, activeExtensions: 0, scannedEntries: 0, limitReached: false },
    findings: [], warnings: [], collectors: [], extensionInventory: entries
  });
  assert.match(html, /Showing 250 of 265 entries/);
  assert.doesNotMatch(html, /publisher.extension264/);
});

test('CPU and RSS display show an aggregate sample and its elapsed duration', () => {
  const html = renderReport({
    schemaVersion: 1, timestamp: '2026-10-08T00:00:00Z',
    environment: { vscodeVersion: '1.94', platform: 'linux', remote: false },
    summary: { installedExtensions: 0, activeExtensions: 0, scannedEntries: 0, limitReached: false },
    process: { cpuPercentOneCore: 125.6, rssMb: 149.3, samplingMs: 505, scope: 'Current Node.js process; NOT individual extension usage' },
    findings: [], warnings: [], collectors: []
  });
  assert.match(html, /125.6%/);
  assert.match(html, /149.3 MB/);
  assert.match(html, /505ms/);
  assert.match(html, /NOT individual extension usage/);
});
test('missing process metrics use explicit N/A rather than fabricating readings', () => {
  const html = renderReport({
    schemaVersion: 1, timestamp: '2026-10-08T00:00:00Z',
    environment: { vscodeVersion: '1.94', platform: 'linux', remote: false },
    summary: { installedExtensions: 0, activeExtensions: 0, scannedEntries: 0, limitReached: false },
    findings: [], warnings: [], collectors: [{id:'process',status:'unavailable',durationMs:0}]
  });
  assert.match(html, /sample unavailable/);
  assert.match(html, /Host process CPU/);
  assert.match(html, /N\/A/);
});
