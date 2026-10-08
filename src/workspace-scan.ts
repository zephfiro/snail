import * as fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import * as path from 'node:path';

export interface ScanResult {
  entries: number;
  limitReached: boolean;
  candidates: string[];
  skippedDirectories: number;
}

export interface ScanOptions {
  maxEntries?: number;
  maxDepth?: number;
  maxMs?: number;
  now?: () => number;
  readDirectory?: (directory: string) => Promise<Dirent[]>;
}

const SKIP = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'vendor', '.venv', 'coverage']);
const CANDIDATES = new Set(['node_modules', '.next', 'dist', 'build', 'vendor', '.venv', 'coverage']);

/**
 * Bounded, directory-name-only scan. Never follows symlinks or reads file contents.
 * A directory that cannot be read increments skippedDirectories rather than failing the whole report.
 */
export async function scanWorkspace(
  folder: string,
  cancelled: () => boolean,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const maxEntries = options.maxEntries ?? 2500;
  const maxDepth = options.maxDepth ?? 5;
  const now = options.now ?? Date.now;
  const deadline = now() + (options.maxMs ?? 2000);
  const readDirectory = options.readDirectory ?? ((directory: string) => fs.readdir(directory, { withFileTypes: true }));
  const stack: Array<{ dir: string; depth: number }> = [{ dir: folder, depth: 0 }];
  const result: ScanResult = { entries: 0, limitReached: false, candidates: [], skippedDirectories: 0 };

  while (stack.length > 0) {
    if (cancelled()) throw new Error('Scan cancelled');
    if (now() >= deadline || result.entries >= maxEntries) {
      result.limitReached = true;
      break;
    }

    const current = stack.pop()!;
    let dirents: Dirent[];
    try {
      dirents = await readDirectory(current.dir);
    } catch {
      result.skippedDirectories++;
      continue;
    }

    for (const entry of dirents) {
      if (cancelled()) throw new Error('Scan cancelled');
      if (now() >= deadline || result.entries >= maxEntries) {
        result.limitReached = true;
        break;
      }

      result.entries++;
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (CANDIDATES.has(entry.name) && !result.candidates.includes(entry.name)) {
        result.candidates.push(entry.name);
      }
      if (current.depth < maxDepth && !SKIP.has(entry.name)) {
        stack.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
      }
    }
    if (result.limitReached) break;
  }
  if (stack.length > 0) result.limitReached = true;
  return result;
}
