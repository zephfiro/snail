import type { Analyzer, ExtensionsEvidence } from '../core/contracts';

export const extensionsAnalyzer: Analyzer<ExtensionsEvidence> = {
  analyze(data) {
    return [{
      id: 'extension-inventory', title: 'Extension inventory', category: 'extensions',
      severity: 'info', confidence: 'informational',
      evidence: data.installedExtensions + ' non-built-in extensions detected; ' +
        data.activeExtensions + ' currently activated. Activation alone does not imply high resource usage.',
      recommendation: 'For an extension-specific suspect, use the built-in Extension Bisect and compare behavior with the extension disabled.'
    }];
  }
};
