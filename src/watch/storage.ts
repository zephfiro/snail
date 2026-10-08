import * as vscode from 'vscode';
import type { WatchSession } from './types';
import {
  isWatchSession, MAX_WATCH_SESSIONS, WATCH_RETENTION_DAYS
} from './types';

export interface WatchStorage {
  save(session: WatchSession): Promise<void>;
  list(): Promise<WatchSession[]>;
  delete(id: string): Promise<void>;
  prune(): Promise<void>;
}

/**
 * One atomic JSON file per session under VS Code's private globalStorageUri.
 * Files are named by random UUID; no workspace paths or extension IDs are stored.
 * Different windows write distinct IDs rather than racing for one shared index.
 */
export class LocalWatchStorage implements WatchStorage {
  private readonly root: vscode.Uri;
  constructor(storageRoot: vscode.Uri) {
    this.root = vscode.Uri.joinPath(storageRoot, 'watch-v1');
  }
  private file(id: string): vscode.Uri {
    if (!/^[a-f\d-]{36}$/.test(id)) throw new Error('Invalid session identifier');
    return vscode.Uri.joinPath(this.root, id + '.json');
  }
  async save(session: WatchSession): Promise<void> {
    if (!isWatchSession(session)) throw new Error('Invalid watch session');
    await vscode.workspace.fs.createDirectory(this.root);
    const finalPath = this.file(session.id);
    const temp = vscode.Uri.joinPath(this.root, session.id + '.tmp');
    const bytes = Buffer.from(JSON.stringify(session), 'utf8');
    // The temporary file belongs to this session's instance only.
    await vscode.workspace.fs.writeFile(temp, bytes);
    await vscode.workspace.fs.rename(temp, finalPath, { overwrite: true });
  }
  async list(): Promise<WatchSession[]> {
    let files: [string, vscode.FileType][];
    try { files = await vscode.workspace.fs.readDirectory(this.root); }
    catch { return []; }
    const sessions: WatchSession[] = [];
    for (const [fileName, kind] of files.slice(0, 300)) {
      if (kind !== vscode.FileType.File || !/^[a-f\d-]{36}\.json$/.test(fileName)) continue;
      try {
        const raw = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this.root, fileName));
        // Keep bounded even if files were replaced/corrupted outside Snail.
        if (raw.byteLength > 1024 * 1024) continue;
        const parsed: unknown = JSON.parse(Buffer.from(raw).toString('utf8'));
        if (isWatchSession(parsed)) sessions.push(parsed);
      } catch { /* Discard corrupt sessions; never crash the extension. */ }
    }
    return sessions.sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));
  }
  async delete(id: string): Promise<void> {
    try { await vscode.workspace.fs.delete(this.file(id)); }
    catch { /* Already removed. */ }
  }
  async prune(): Promise<void> {
    const sessions = await this.list();
    const expiration = Date.now() - WATCH_RETENTION_DAYS * 86400000;
    let kept = 0;
    for (const session of sessions) {
      // Do not remove a running session owned by a different window.
      if (session.state === 'recording' && Date.parse(session.lastSavedAt) >= expiration) continue;
      if (kept < MAX_WATCH_SESSIONS && Date.parse(session.startedAt) >= expiration) kept++;
      else await this.delete(session.id);
    }
  }
}
