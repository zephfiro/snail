import type { Report } from './core/contracts';

/**
 * Shareable report is allowlisted: extension identifiers, display names and
 * versions are local-only. User-controlled error strings are excluded.
 * Further generic redaction is tracked in #5.
 */
export function createShareableReport(report: Report): Omit<Report, 'extensionInventory'> {
  return {
    schemaVersion: report.schemaVersion,
    timestamp: report.timestamp,
    environment: {
      vscodeVersion: report.environment.vscodeVersion,
      platform: report.environment.platform,
      remote: report.environment.remote
    },
    summary: {
      installedExtensions: report.summary.installedExtensions,
      activeExtensions: report.summary.activeExtensions,
      scannedEntries: report.summary.scannedEntries,
      limitReached: report.summary.limitReached
    },
    ...(report.process ? {
      process: {
        cpuPercentOneCore: report.process.cpuPercentOneCore,
        rssMb: report.process.rssMb,
        samplingMs: report.process.samplingMs,
        scope: report.process.scope
      }
    } : {}),
    findings: report.findings.map(finding => ({
      id: finding.id,
      title: finding.title,
      category: finding.category,
      severity: finding.severity,
      confidence: finding.confidence,
      evidence: finding.evidence,
      recommendation: finding.recommendation,
      ...(finding.sources ? { sources: [...finding.sources] } : {})
    })),
    warnings: [],
    collectors: report.collectors.map(item => ({
      id: item.id,
      status: item.status,
      durationMs: item.durationMs
    }))
  };
}
