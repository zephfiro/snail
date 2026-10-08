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
