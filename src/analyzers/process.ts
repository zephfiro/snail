import type { Analyzer, ProcessEvidence } from '../core/contracts';

/**
 * Only the CPU delta itself is measured. A short spike is not evidence of
 * long-term slowness, nor can it implicate any particular extension.
 */
export const processAnalyzer: Analyzer<ProcessEvidence> = {
  analyze(data) {
    if (data.cpuPercentOneCore <= 70) return [];
    return [{
      id: 'extension-host-cpu', title: 'Extension Host CPU activity during sample',
      category: 'process', severity: 'warning', confidence: 'measured',
      evidence: 'The current Node.js process used ' + data.cpuPercentOneCore +
        '% of one CPU core during a ' + data.samplingMs +
        'ms sample. This is a short observation, not sustained usage, and cannot identify a specific extension.',
      recommendation: 'Repeat a diagnosis while the slowdown occurs, then use Developer: Show Running Extensions and Help: Open Process Explorer to investigate. Language servers may run in separate processes.'
    }];
  }
};
