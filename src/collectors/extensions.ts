import type { DiagnosticCollector, ExtensionsEvidence } from '../core/contracts';

export const extensionsCollector: DiagnosticCollector<ExtensionsEvidence> = {
  id: 'extensions',
  async collect(context) {
    const installed = context.services.listExtensions().filter(extension => !extension.id.startsWith('vscode.'));
    return {
      data: {
        installedExtensions: installed.length,
        activeExtensions: installed.filter(extension => extension.isActive).length
      }
    };
  }
};
