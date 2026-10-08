import type { DiagnosticCollector, SettingsEvidence } from '../core/contracts';

export const settingsCollector: DiagnosticCollector<SettingsEvidence> = {
  id: 'settings',
  async collect(context) {
    return { data: { watcherExclude: { ...context.services.watcherExclude() } } };
  }
};
