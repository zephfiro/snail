import type {
  DiagnosticCollector, ExtensionInventoryEntry, ExtensionSource, ExtensionsEvidence
} from '../core/contracts';

function optionalText(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

/**
 * Normalizes a single snapshot of public VS Code extension metadata.
 * The vscode.* prefix is used as a fallback for built-in extensions when
 * an explicit isBuiltin flag is unavailable. No extension is activated.
 */
export function collectExtensionInventory(raw: readonly ExtensionSource[]): {
  evidence: ExtensionsEvidence;
  invalidEntries: number;
} {
  const entries: ExtensionInventoryEntry[] = [];
  const seen = new Set<string>();
  let invalidEntries = 0;

  for (const source of raw) {
    const id = optionalText(source?.id, 200);
    if (!id) {
      invalidEntries++;
      continue;
    }
    const key = id.toLowerCase();
    if (seen.has(key)) {
      invalidEntries++;
      continue;
    }
    seen.add(key);
    const isBuiltin = source.isBuiltin === true || (source.isBuiltin !== false && key.startsWith('vscode.'));
    const version = optionalText(source.version, 80);
    entries.push({
      id,
      displayName: optionalText(source.displayName, 160) ?? id,
      ...(version ? { version } : {}),
      isActive: source.isActive === true,
      isBuiltin,
      extensionKind: source.extensionKind === 1 ? 'ui' : source.extensionKind === 2 ? 'workspace' : 'unknown'
    });
  }

  // Keep third-party extensions first in the local detail view.
  entries.sort((a, b) => Number(a.isBuiltin) - Number(b.isBuiltin) || a.id.localeCompare(b.id));
  const thirdParty = entries.filter(entry => !entry.isBuiltin);
  return {
    evidence: {
      installedExtensions: thirdParty.length,
      activeExtensions: thirdParty.filter(entry => entry.isActive).length,
      builtinExtensions: entries.length - thirdParty.length,
      entries
    },
    invalidEntries
  };
}

export const extensionsCollector: DiagnosticCollector<ExtensionsEvidence> = {
  id: 'extensions',
  async collect(context) {
    const snapshot = context.services.listExtensions();
    const { evidence, invalidEntries } = collectExtensionInventory(snapshot);
    return {
      data: evidence,
      ...(invalidEntries ? {
        warnings: ['Extension inventory skipped ' + invalidEntries +
          ' missing or duplicate identifiers. Snapshot may be partial.']
      } : {})
    };
  }
};
