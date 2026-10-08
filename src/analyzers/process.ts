import type { Analyzer, ProcessEvidence } from '../core/contracts';

export const processAnalyzer: Analyzer<ProcessEvidence> = {
  analyze(data) {
    if (data.cpuPercentOneCore <= 65) return [];
    return [{
      id: 'extension-host-cpu', title: 'Extension-host CPU activity during sample',
      category: 'process', severity: 'warning', confidence: 'measured',
      evidence: 'Current process used ' + data.cpuPercentOneCore +
        '% of one CPU core over ' + data.samplingMs +
        'ms; this is one short snapshot and cannot identify a specific extension.',
      recommendation: 'Repeat during noticeable slowness; inspect Developer: Show Running Extensions and Help: Open Process Explorer for deeper attribution.'
    }];
  }
};
