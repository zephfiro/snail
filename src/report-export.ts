import type { Report } from './core/contracts';

/**
 * Only static catalog identifiers and numeric aggregates leave the local view.
 * A denylist of filesystem patterns cannot guarantee secret-free output:
 * user/extension supplied free-text fields must never be copied to exports.
 */
const findingsCatalog = {
  'extension-host-cpu': 'Aggregate Extension Host CPU observation',
  'extension-inventory': 'Extension inventory summary',
  'workspace-generated-dirs': 'Generated-directory exclusion review',
  'workspace-search-exclude': 'Generated-directory search exclusion review',
  'tsserver-verbose-logging': 'TypeScript server logging configuration'
} as const;
const suspectCatalog = {
  'extension-host-cpu': 'Aggregate Extension Host CPU hypothesis',
  'generated-directories-watchers': 'Generated directory watcher hypothesis',
  'tsserver-verbose-logging': 'TypeScript server verbose logging hypothesis'
} as const;
const collectors = new Set(['extensions', 'process', 'workspace', 'settings']);
const categories = new Set(['extensions', 'process', 'workspace', 'settings']);
const severities = new Set(['info', 'warning', 'critical']);
const confidences = new Set(['measured', 'inferred', 'informational']);
const statuses = new Set(['collected', 'unavailable', 'failed', 'skipped', 'timed_out']);
const priorityValues = new Set(['investigate_first', 'possible', 'insufficient_evidence']);

function safeNumber(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}
function safeDate(value: string): string {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}
function safeVersion(value: string): string {
  return /^\d+(?:\.\d+){1,3}(?:-[\w.-]{1,30})?$/.test(value) ? value : 'unknown';
}

/** An explicit, minimally useful export schema (no extension IDs, paths or raw messages). */
export function createShareableReport(report: Report) {
  return {
    schemaVersion: 1 as const,
    timestamp: safeDate(report.timestamp),
    environment: {
      vscodeVersion: safeVersion(report.environment.vscodeVersion),
      platform: ['linux', 'win32', 'darwin'].includes(report.environment.platform)
        ? report.environment.platform : 'unknown',
      remote: Boolean(report.environment.remote)
    },
    summary: {
      installedExtensions: safeNumber(report.summary.installedExtensions),
      activeExtensions: safeNumber(report.summary.activeExtensions),
      scannedEntries: safeNumber(report.summary.scannedEntries),
      limitReached: Boolean(report.summary.limitReached)
    },
    ...(report.process ? {
      process: {
        cpuPercentOneCore: safeNumber(report.process.cpuPercentOneCore),
        rssMb: safeNumber(report.process.rssMb),
        samplingMs: safeNumber(report.process.samplingMs),
        scope: 'Node Extension Host process aggregate; no per-extension attribution'
      }
    } : {}),
    findings: report.findings
      .filter(finding => Object.hasOwn(findingsCatalog,finding.id))
      .map(finding => ({
        id: finding.id,
        title: findingsCatalog[finding.id as keyof typeof findingsCatalog],
        category: categories.has(finding.category) ? finding.category : 'settings',
        severity: severities.has(finding.severity) ? finding.severity : 'info',
        confidence: confidences.has(finding.confidence) ? finding.confidence : 'informational',
        evidence: 'Further details are available only in the local Snail Doctor panel.',
        recommendation: 'Investigate the finding locally and collect only deliberately shared evidence.',
        sources: (finding.sources ?? []).filter(source => collectors.has(source))
      })),
    suspects: (report.suspects ?? [])
      .filter(suspect => Object.hasOwn(suspectCatalog,suspect.id))
      .map(suspect => ({
        id: suspect.id,
        title: suspectCatalog[suspect.id as keyof typeof suspectCatalog],
        priority: priorityValues.has(suspect.priority) ? suspect.priority : 'insufficient_evidence',
        status: suspect.status === 'suspected' ? 'suspected' : 'insufficient_evidence',
        note: 'This is a hypothesis, not a confirmed component-level root cause.'
      })),
    durationMs: safeNumber(report.durationMs ?? 0),
    budgetExceeded: Boolean(report.budgetExceeded),
    warnings: [] as string[],
    collectors: report.collectors.filter(item => collectors.has(item.id)).map(item => ({
      id: item.id,
      status: statuses.has(item.status) ? item.status : 'failed',
      durationMs: safeNumber(item.durationMs)
    }))
  };
}
