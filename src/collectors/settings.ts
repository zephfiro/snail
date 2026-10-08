import type { DiagnosticCollector, SettingsEvidence } from '../core/contracts';

function safeExcludes(source: Readonly<Record<string, boolean>>): Record<string, boolean> {
  // No arbitrary settings names are placed in reports: downstream rules
  // examine patterns locally and only mention fixed, known directory names.
  return Object.fromEntries(
    Object.entries(source).filter(([key, enabled]) =>
      typeof key === 'string' && key.length <= 250 && enabled === true
    ).slice(0, 200)
  );
}
export const settingsCollector: DiagnosticCollector<SettingsEvidence> = {
  id: 'settings',
  async collect(context) {
    const raw=context.services.tsServerLogLevel?.();
    const tsServerLogLevel = raw === 'off' || raw === 'normal' || raw === 'verbose' ? raw : 'unknown';
    return {
      data: {
        watcherExclude: safeExcludes(context.services.watcherExclude()),
        ...(context.services.searchExclude ? {
          searchExclude: safeExcludes(context.services.searchExclude())
        } : {}),
        tsServerLogLevel
      }
    };
  }
};
