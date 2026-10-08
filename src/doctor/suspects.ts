import type {
  CollectorRecord, ExtensionsEvidence, ProcessEvidence, SettingsEvidence, WorkspaceEvidence
} from '../core/contracts';
import type { EvidenceSnapshot } from '../core/contracts';

export type SuspectCategory = 'extension-host' | 'watcher' | 'language-server' | 'extension' | 'workspace' | 'configuration';
export type EvidenceSource = 'measured_by_snail' | 'inferred' | 'manual_observation' | 'vscode_log';
export type SuspectStatus = 'suspected' | 'insufficient_evidence';
export type SuspectPriority = 'investigate_first' | 'possible' | 'insufficient_evidence';
export interface SuspectEvidence {
  origin: string;
  source: EvidenceSource;
  observation: string;
  limitation: string;
  /** Separate subjects prevent process-level metrics from being mistaken for extension metrics. */
  subject: string;
}
export interface Suspect {
  id: string;
  title: string;
  category: SuspectCategory;
  hypothesis: string;
  evidence: SuspectEvidence[];
  counterEvidence: string[];
  nextStep: string;
  status: SuspectStatus;
  priority: SuspectPriority;
  priorityReason: string;
}
export interface SuspectRule {
  id: string;
  evaluate(snapshot: EvidenceSnapshot, records: readonly CollectorRecord[]): Suspect | undefined;
}
const collected = (records: readonly CollectorRecord[], name: string) =>
  records.some(record => record.id === name && record.status === 'collected');

export const extensionHostRule: SuspectRule = {
  id: 'extension-host-cpu',
  evaluate(snapshot, records) {
    if (!collected(records, 'process')) return;
    const process = snapshot.get<ProcessEvidence>('process');
    if (!process || process.cpuPercentOneCore <= 70) return;
    return {
      id: 'extension-host-cpu', title: 'Elevated Extension Host CPU', category: 'extension-host',
      hypothesis: 'Work in the current Node Extension Host may contribute to responsiveness problems.',
      evidence: [{
        origin: 'process', subject: 'extension_host', source: 'measured_by_snail',
        observation: `${process.cpuPercentOneCore}% of one CPU core during ${process.samplingMs} ms; RSS ${process.rssMb} MiB.`,
        limitation: 'One short process-wide sample; does not identify any extension or establish sustained slowness.'
      }],
      counterEvidence: ['An unrelated process, language server or workload may be responsible.', 'A later sample may be normal.'],
      nextStep: 'Repeat during the slowdown and inspect Help: Open Process Explorer. Use Extension Bisect only if repeatable evidence supports investigating extensions.',
      status: 'suspected', priority: 'possible',
      priorityReason: 'Observed host-level activity; no causal or per-extension attribution.'
    };
  }
};

export const watcherConfigurationRule: SuspectRule = {
  id: 'generated-directories-watchers',
  evaluate(snapshot, records) {
    if (!collected(records, 'workspace') || !collected(records, 'settings')) return;
    const workspace = snapshot.get<WorkspaceEvidence>('workspace');
    const settings = snapshot.get<SettingsEvidence>('settings');
    if (!workspace || !settings) return;
    const candidates = workspace.scan.candidates.filter(name =>
      !Object.entries(settings.watcherExclude).some(([pattern, enabled]) => enabled && pattern.includes(name))
    );
    if (!candidates.length) return;
    return {
      id: 'generated-directories-watchers', title: 'Review generated-file watcher exclusions', category: 'watcher',
      hypothesis: 'File watching or indexing generated folders could create unnecessary work.',
      evidence: [{
        origin: 'workspace,settings', subject: 'workspace_watchers', source: 'inferred',
        observation: `Detected directory names ${candidates.join(', ')} without matching enabled watcherExclude patterns in inspected configuration.`,
        limitation: 'Names/patterns are heuristics only. Neither active watchers nor CPU/I/O load were measured.'
      }],
      counterEvidence: [
        'Language tooling may already ignore these folders.',
        'Explicit exclusion can break expected tooling if a folder is required.'
      ],
      nextStep: 'Inspect files.watcherExclude and search.exclude, verify with an on/off experiment after backing up the setting.',
      status: 'suspected', priority: 'possible',
      priorityReason: workspace.scan.limitReached
        ? 'Config hypothesis with incomplete workspace scan; no watcher load measured.'
        : 'Config hypothesis from directory names and settings; no watcher load measured.'
    };
  }
};

export const typeScriptLoggingRule: SuspectRule = {
  id:'tsserver-verbose-logging',
  evaluate(snapshot, records) {
    if (!collected(records,'settings')) return;
    const setting=snapshot.get<SettingsEvidence>('settings');
    if (setting?.tsServerLogLevel!=='verbose') return;
    return {
      id:'tsserver-verbose-logging',
      title:'TypeScript Server verbose logging is enabled',category:'configuration',
      hypothesis:'Verbose TypeScript logging may add diagnostic overhead during editor operations.',
      evidence:[{
        origin:'settings',source:'inferred',subject:'typescript_server_logging',
        observation:'typesript.tsserver.log is set to verbose.',
        limitation:'No tsserver process utilization or added overhead was measured.'
      }],
      counterEvidence:['Logging may have negligible impact for this workload.','Slowdowns may be unrelated to TypeScript.'],
      nextStep:'Use the TypeScript investigation plan; compare the same operation with verbose logging toggled manually, then restore the setting.',
      status:'suspected',priority:'possible',
      priorityReason:'Observed configuration only; no independently measured TS Server impact.'
    };
  }
};
export const DEFAULT_SUSPECT_RULES: readonly SuspectRule[] = [
  extensionHostRule, watcherConfigurationRule, typeScriptLoggingRule
];

/** Pure, deterministic rule executor. No rule may read VS Code APIs or I/O. */
export function detectSuspects(
  snapshot: EvidenceSnapshot,
  records: readonly CollectorRecord[],
  rules: readonly SuspectRule[] = DEFAULT_SUSPECT_RULES
): Suspect[] {
  const result: Suspect[] = [];
  for (const rule of rules) {
    try {
      const suspect = rule.evaluate(snapshot, records);
      if (suspect && suspect.evidence.length) result.push(suspect);
    } catch {
      // A faulty rule must not fabricate a candidate or prevent other rules.
    }
  }
  return result;
}
