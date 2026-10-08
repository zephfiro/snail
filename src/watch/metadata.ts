import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import type { ExplorerExtensionMetadata } from './explorer';

const LIMIT=80;
const ICON_LIMIT=128*1024;
const mimeByExt:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};

/** A manifest icon must be a relative, normal path within the extension root. */
export function validManifestIcon(relative:unknown): relative is string {
  if(typeof relative!=='string'||!relative||relative.length>240||relative.includes('\\')||
    relative.includes('\0')||path.posix.isAbsolute(relative)||relative.includes(':'))return false;
  const segments=relative.split('/');
  return segments.every(segment=>segment!==''&&segment!=='.'&&segment!=='..') &&
    Boolean(mimeByExt[path.posix.extname(relative).toLowerCase()]);
}
function validImage(bytes:Uint8Array,mime:string):boolean {
  if(!bytes.length||bytes.length>ICON_LIMIT)return false;
  if(mime==='image/png')return bytes.length>=8&&
    Buffer.from(bytes.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if(mime==='image/jpeg')return bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if(mime==='image/webp')return bytes.length>=12&&
    Buffer.from(bytes.subarray(0,4)).toString()==='RIFF'&&
    Buffer.from(bytes.subarray(8,12)).toString()==='WEBP';
  return false;
}
export async function localIconData(extension:vscode.Extension<unknown>):Promise<string|undefined> {
  if(extension.extensionUri.scheme!=='file')return;
  const metadata:unknown=extension.packageJSON;
  if(!metadata||typeof metadata!=='object')return;
  const name=(metadata as {icon?:unknown}).icon;
  if(!validManifestIcon(name))return;
  const root=path.resolve(extension.extensionUri.fsPath);
  const iconPath=path.resolve(root,...name.split('/'));
  if(!iconPath.startsWith(root+path.sep))return;
  try {
    const resolved=await fs.realpath(iconPath);
    const relative=path.relative(await fs.realpath(root),resolved);
    if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))return;
    const info=await fs.stat(resolved);
    if(!info.isFile()||info.size>ICON_LIMIT)return;
    const bytes=await fs.readFile(resolved);
    const mime=mimeByExt[path.posix.extname(name).toLowerCase()];
    if(!validImage(bytes,mime))return;
    return 'data:'+mime+';base64,'+Buffer.from(bytes).toString('base64');
  } catch {return;}
}
/**
 * Transient presentation data only. Does not read source files or activate extensions.
 * Installed/active NOW does not prove historical activation during a saved session.
 */
export async function currentExtensionMetadata():Promise<ExplorerExtensionMetadata[]> {
  const installed=vscode.extensions.all
    .filter(e=>!e.id.startsWith('vscode.'))
    .slice(0,LIMIT);
  const records:ExplorerExtensionMetadata[]=[];
  // Read sequentially: bounded I/O rather than 80 concurrent image requests.
  for(const ext of installed){
    const packageJSON:unknown=ext.packageJSON;
    const manifest=packageJSON&&typeof packageJSON==='object'
      ? packageJSON as Record<string,unknown>:{};
    const id=ext.id.slice(0,160);
    records.push({
      id,
      name:typeof manifest.displayName==='string'&&manifest.displayName.trim()
        ? manifest.displayName.slice(0,120):id,
      publisher:typeof manifest.publisher==='string'?manifest.publisher.slice(0,100):undefined,
      version:typeof manifest.version==='string'?manifest.version.slice(0,45):undefined,
      icon:await localIconData(ext),
      activeNow:ext.isActive
    });
  }
  return records;
}
