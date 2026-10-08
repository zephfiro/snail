import type { DiagnosticCollector, ProcessEvidence } from '../core/contracts';

export const processCollector: DiagnosticCollector<ProcessEvidence> = {
  id: 'process',
  async collect(context) {
    return {
      data: await context.services.sampleProcess(() => context.cancellation.isCancellationRequested)
    };
  }
};
