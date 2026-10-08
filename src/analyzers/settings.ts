import type { Analyzer, SettingsEvidence, Finding } from '../core/contracts';

export const settingsAnalyzer: Analyzer<SettingsEvidence> = {
  analyze(data): readonly Finding[] {
    if (data.tsServerLogLevel !== 'verbose') return [];
    return [{
      id: 'tsserver-verbose-logging',
      title: 'Review verbose TypeScript Server logging',
      category: 'settings', severity: 'info', confidence: 'inferred',
      evidence: 'The effective typescript.tsserver.log setting is verbose. This is a configuration observation, not proof the server is running or consuming extra CPU.',
      recommendation: 'If TypeScript editing is slow, examine the TS Server with native tools and consider turning verbose logging off after collecting necessary logs. Re-test one change at a time.'
    }];
  }
};
