import {
  CollectionUnavailable, type DiagnosticCollector, type WorkspaceEvidence
} from '../core/contracts';

export const workspaceCollector: DiagnosticCollector<WorkspaceEvidence> = {
  id: 'workspace',
  async collect(context) {
    const root = context.services.workspaceRoot();
    if (!root || root.scheme !== 'file') {
      throw new CollectionUnavailable('No local workspace folder available for the bounded scan (remote/virtual folders not inspected).');
    }
    const scan = await context.services.scanWorkspace(
      root.fsPath,
      () => context.cancellation.isCancellationRequested,
      context.limits.workspace
    );
    const warnings: string[] = [];
    if (scan.skippedDirectories > 0) {
      warnings.push('Could not read ' + scan.skippedDirectories + ' directories; workspace scan is partial.');
    }
    if (scan.limitReached) {
      warnings.push('Workspace scan reached its time or entry limit: results are partial.');
    }
    return { data: { scan }, warnings };
  }
};
