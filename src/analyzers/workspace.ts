import type {
  Analyzer, SettingsEvidence, WorkspaceEvidence
} from '../core/contracts';

export const workspaceAnalyzer: Analyzer<WorkspaceEvidence> = {
  analyze(data, snapshot) {
    if (!data.scan.candidates.length) return [];
    const settings = snapshot.get<SettingsEvidence>('settings');
    // Missing settings evidence is not equivalent to an empty exclusion configuration.
    if (!settings) return [];
    const excludes = settings.watcherExclude;
    const missing = data.scan.candidates.filter(candidate =>
      !Object.entries(excludes).some(([pattern, enabled]) => enabled && pattern.includes(candidate))
    );
    if (!missing.length) return [];
    return [{
      id: 'workspace-generated-dirs', title: 'Review generated directory exclusions',
      category: 'workspace', severity: 'info', confidence: 'inferred',
      sources: ['workspace', 'settings'],
      evidence: 'Found directory names often associated with generated/dependency files: ' +
        missing.join(', ') + '. Only names were inspected; no costly watcher activity was measured.',
      recommendation: 'Review files.watcherExclude and search.exclude before changing anything. Some language tools still need to index these directories.'
    }];
  }
};
