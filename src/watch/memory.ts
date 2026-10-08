import type { ExplorerSeries } from './explorer';

/** Memory from a shared Extension Host cannot be assigned to extensions. */
export interface MemoryAttribution {
  extensionId:string;
  displayName:string;
  source:'verified-dedicated-process';
  processId:number;
  /** Ownership of an isolated process needs independent verification. */
  ownerVerified:boolean;
  exclusiveOwner:boolean;
  unit:'rss-mib';
  points:readonly {time:number;rssMiB:number}[];
}
/**
 * Future adapter boundary for independently verifiable subprocess readings.
 * The current passive Watch has no source satisfying this contract and returns
 * no individual RAM lines. Shared host RSS is NEVER split between extensions.
 */
export function verifiedMemorySeries(readings:readonly MemoryAttribution[]):ExplorerSeries[] {
  return readings.filter(reading=>
    reading.source==='verified-dedicated-process'&&reading.ownerVerified&&reading.exclusiveOwner&&
    Number.isSafeInteger(reading.processId)&&reading.processId>0&&
    /^[A-Za-z0-9-]+\.[A-Za-z0-9-]+$/.test(reading.extensionId)&&
    reading.points.length>=2&&reading.points.length<=1440&&
    reading.points.every(x=>Number.isFinite(x.time)&&Number.isFinite(x.rssMiB)&&x.time>=0&&x.rssMiB>=0)
  ).map(reading=>({
    id:reading.extensionId,name:reading.displayName,
    source:'verified-dedicated-process',confidence:'measured',
    unit:'rss-mib',points:reading.points.map(point=>({time:point.time,value:point.rssMiB}))
  }));
}
