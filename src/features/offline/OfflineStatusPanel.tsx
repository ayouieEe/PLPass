import { Cloud, CloudOff, Database, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { OfflineStatus } from "./types";

export function OfflineStatusPanel({status,busy,onPrepare,onRetry}:{status:OfflineStatus;busy:boolean;onPrepare:()=>void;onRetry:()=>void}){
  const online=status.connectivity==="online"; const total=status.pendingCount;
  const message=!status.runtimeAvailable?"Offline attendance is unavailable in browser":!online?`Offline - ${total} records waiting to sync`:status.syncingCount?`Online - Synchronizing ${status.syncingCount} of ${total}`:status.conflictCount?`${status.conflictCount} conflict${status.conflictCount===1?"":"s"} requiring review`:total?`Online - ${total} records waiting to sync`:"All attendance synchronized";
  return <section className="rounded-lg border bg-surface p-4" aria-live="polite" aria-label="Offline attendance status">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-start gap-3">{online?<Cloud className="mt-0.5 h-5 w-5" aria-hidden/>:<CloudOff className="mt-0.5 h-5 w-5" aria-hidden/>}<div><p className="font-semibold">{message}</p><p className="text-sm text-muted-foreground">{status.runtimeAvailable?(status.packageStatus==="READY"?`Event ready for offline use${status.preparedAt?` - prepared ${new Date(status.preparedAt).toLocaleString()}`:""}`:"Event package not prepared"):"Open this page in the PLPass desktop app to enable SQLite offline attendance."}</p></div></div>
    <div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={busy||!status.runtimeAvailable||!online} onClick={onPrepare}><Database className="mr-2 h-4 w-4" aria-hidden/>{status.packageStatus==="READY"?"Refresh offline package":"Prepare for Offline Use"}</Button><Button type="button" variant="outline" size="sm" disabled={busy||!status.runtimeAvailable||!online||(!total&&!status.retryCount)} onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" aria-hidden/>Retry Sync</Button></div></div>
  </section>;
}
