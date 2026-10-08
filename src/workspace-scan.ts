import * as fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import * as path from 'node:path';

export type ScanLimitReason = 'time' | 'entries' | 'depth' | 'unreadable';
export interface ScanResult {
  entries: number;
  limitReached: boolean;
  candidates: string[];
  skippedDirectories: number;
  scannedDirectories: number;
  skippedSymlinks: number;
  depthLimitedDirectories: number;
  limitReasons: ScanLimitReason[];
}

export interface ScanOptions {
  maxEntries?: number;
  maxDepth?: number;
  maxMs?: number;
  now?: () => number;
  /** For deterministic tests. Production streams directory entries with fs.opendir. */
  openDirectory?: (directory: string) => Promise<AsyncIterable<Dirent>>;
  /** Compatibility test seam: production never uses readdir to materialize large folders. */
  readDirectory?: (directory: string) => Promise<Dirent[]>;
}

const SKIP = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'vendor', '.venv', 'coverage']);
const CANDIDATES = new Set(['node_modules', '.next', 'dist', 'build', 'vendor', '.venv', 'coverage']);
const YIELD_EVERY = 128;

function limit(result: ScanResult, reason: ScanLimitReason): void {
  result.limitReached = true;
  if (!result.limitReasons.includes(reason)) result.limitReasons.push(reason);
}

/**
 * Stream directory entries asynchronously rather than allocating huge readdir
 * arrays. Cancellation is cooperative: an already pending filesystem operation
 * cannot be forcibly interrupted. The runner has a separate wall-time budget.
 */
export async function scanWorkspace(
  folder: string,
  cancelled: () => boolean,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const maxEntries = options.maxEntries ?? 2500;
  const maxDepth = options.maxDepth ?? 5;
  const maxMs = options.maxMs ?? 2000;
  if (!Number.isSafeInteger(maxEntries) || maxEntries < 0 ||
      !Number.isSafeInteger(maxDepth) || maxDepth < 0 ||
      !Number.isFinite(maxMs) || maxMs < 0) {
    throw new Error('Invalid workspace scan limits');
  }
  const now = options.now ?? (() => Number(process.hrtime.bigint()) / 1_000_000);
  const deadline = now() + maxMs;
  const stack: Array<{ dir: string; depth: number }> = [{ dir: folder, depth: 0 }];
  const result: ScanResult = {
    entries: 0, limitReached: false, candidates: [], skippedDirectories: 0,
    scannedDirectories: 0, skippedSymlinks: 0, depthLimitedDirectories: 0, limitReasons: []
  };
  const candidates = new Set<string>();
  const open = options.openDirectory ?? (options.readDirectory
    ? async (directory: string): Promise<AsyncIterable<Dirent>> => {
        const entries = await options.readDirectory!(directory);
        return (async function* () { yield* entries; })();
      }
    : (directory: string) => fs.opendir(directory));

  // No recursion, file-content reading, symlink following, or unbounded I/O.
  while (stack.length) {
    if (cancelled()) throw new Error('Scan cancelled');
    if (now() >= deadline) { limit(result, 'time'); break; }
    if (result.entries >= maxEntries) { limit(result, 'entries'); break; }

    const current = stack.pop()!;
    let entries: AsyncIterable<Dirent>;
    try {
      entries = await open(current.dir);
    } catch {
      result.skippedDirectories++;
      limit(result, 'unreadable');
      continue;
    }
    result.scannedDirectories++;

    // for-await automatically closes the fs.Dir iterator when leaving early.
    try {
      for await (const entry of entries) {
        if (cancelled()) throw new Error('Scan cancelled');
        if (now() >= deadline) { limit(result, 'time'); break; }
        if (result.entries >= maxEntries) { limit(result, 'entries'); break; }
        result.entries++;

        if (entry.isSymbolicLink()) {
          result.skippedSymlinks++;
        } else if (entry.isDirectory()) {
          if (CANDIDATES.has(entry.name)) candidates.add(entry.name);
          if (!SKIP.has(entry.name)) {
            if (current.depth >= maxDepth) {
              result.depthLimitedDirectories++;
              limit(result, 'depth');
            } else {
              stack.push({ dir: path.join(current.dir, entry.name), depth: current.depth + 1 });
            }
          }
        }
        // Allow UI and cancellation events to run even for injected fast iterators.
        if (result.entries % YIELD_EVERY === 0) {
          await new Promise<void>(resolve => setImmediate(resolve));
        }
      }
    } catch (error) {
      if (cancelled()) throw new Error('Scan cancelled');
      // An inaccessible subdirectory must never reveal its absolute path.
      void error;
      result.skippedDirectories++;
      limit(result, 'unreadable');
    }

    if (result.limitReasons.includes('time') || result.limitReasons.includes('entries')) break;
  }
  // A hard bound being reached never implies that the scan was complete.
  if (stack.length > 0 && !result.limitReached) limit(result, 'entries');
  result.candidates = [...candidates].sort();
  return result;
}
