import type {
  Analyzer, SettingsEvidence, WorkspaceEvidence, Finding
} from '../core/contracts';

function uncovered(names: readonly string[], patterns: Readonly<Record<string, boolean>>): string[] {
  return names.filter(name =>
    !Object.entries(patterns).some(([pattern, enabled]) => enabled && pattern.includes(name))
  );
}

export const workspaceAnalyzer: Analyzer<WorkspaceEvidence> = {
  analyze(data, snapshot): readonly Finding[] {
    if (!data.scan.candidates.length) return [];
    const settings = snapshot.get<SettingsEvidence>('settings');
    if (!settings) return [];
    const watcherMissing=uncovered(data.scan.candidates,settings.watcherExclude);
    const findings: Finding[]=[];
    if (watcherMissing.length) findings.push({
      id: 'workspace-generated-dirs', title: 'Review generated directory watcher exclusions',
      category: 'workspace', severity: 'info', confidence: 'inferred',
      sources: ['workspace', 'settings'],
      evidence: 'Found directory names often associated with generated/dependency files: ' +
        watcherMissing.join(', ') + '. Names and effective settings are known, but actual watcher load was not measured.',
      recommendation: 'Review files.watcherExclude; some language tools still need those directories. Verify any setting change with a controlled experiment.'
    });
    if (settings.searchExclude) {
      const searchMissing=uncovered(data.scan.candidates,settings.searchExclude);
      if (searchMissing.length) findings.push({
        id:'workspace-search-exclude', title:'Review generated directory search exclusions',
        category:'workspace',severity:'info',confidence:'inferred',
        sources:['workspace','settings'],
        evidence:'Generated directory names without matching enabled search.exclude patterns: '+searchMissing.join(', ')+
          '. This does not prove search slowness.',
        recommendation:'Review effective search.exclude patterns and test one safe change at a time.'
      });
    }
    return findings;
  }
};
