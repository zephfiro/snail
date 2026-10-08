import { defineDiagnostic, type DiagnosticModule } from './contracts';
import { extensionsCollector } from '../collectors/extensions';
import { processCollector } from '../collectors/process';
import { workspaceCollector } from '../collectors/workspace';
import { settingsCollector } from '../collectors/settings';
import { extensionsAnalyzer } from '../analyzers/extensions';
import { processAnalyzer } from '../analyzers/process';
import { workspaceAnalyzer } from '../analyzers/workspace';

/** Composition root. The runner never needs changing to register another module. */
export function createDefaultModules(): DiagnosticModule[] {
  return [
    defineDiagnostic(extensionsCollector, extensionsAnalyzer),
    defineDiagnostic(processCollector, processAnalyzer),
    defineDiagnostic(workspaceCollector, workspaceAnalyzer),
    defineDiagnostic(settingsCollector)
  ];
}
