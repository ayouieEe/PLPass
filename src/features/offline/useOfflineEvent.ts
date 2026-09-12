import { useCallback, useEffect, useRef, useState } from "react";
import { desktopApi, confirmSupabaseConnectivity, getOfflineRuntimeConfig, prepareEventForOffline, synchronizePendingAttendance } from "./offlineService";
import { automaticSyncDelayMs } from "./autoSyncPolicy";
import type { OfflineStatus, PendingAttendanceRecord, PreparedEventPackage } from "./types";

const unavailable: OfflineStatus={runtimeAvailable:false,connectivity:"checking",packageStatus:"NOT_PREPARED",pendingCount:0,retryCount:0,conflictCount:0,failedCount:0,syncingCount:0};

export function useOfflineEvent(eventId?:string,sessionId?:string){
  const [status,setStatus]=useState<OfflineStatus>(unavailable); const [busy,setBusy]=useState(false);
  const [autoSyncEnabled,setAutoSyncEnabled]=useState<boolean>();
  const [forceLocalAttendance,setForceLocalAttendance]=useState(false);
  const [pendingRecords,setPendingRecords]=useState<PendingAttendanceRecord[]>([]);
  const [preparedEvent,setPreparedEvent]=useState<PreparedEventPackage|null>(null);
  const syncInFlight=useRef<Promise<void>|null>(null);
  const refresh=useCallback(async()=>{ const api=desktopApi(); if(!api){setPendingRecords([]);setStatus({...unavailable,connectivity:(await confirmSupabaseConnectivity())?"online":"offline"});return;} const pkg=eventId?await api.getPreparedEvent(eventId):sessionId?await api.getPreparedEventBySession(sessionId):null; const resolvedId=eventId??pkg?.event.id; if(!resolvedId){setPreparedEvent(null);setPendingRecords([]);setStatus({...unavailable,runtimeAvailable:true,connectivity:(await confirmSupabaseConnectivity())?"online":"offline"});return;} const [local,online,pending]=await Promise.all([api.getStatus(resolvedId),confirmSupabaseConnectivity(),api.listPending(resolvedId)]); setPreparedEvent(pkg);setPendingRecords(pending);setStatus({...local,connectivity:online?"online":"offline"}); },[eventId,sessionId]);
  const sync=useCallback(async()=>{if(syncInFlight.current)return syncInFlight.current;const run=(async()=>{setBusy(true);try{await synchronizePendingAttendance();await refresh();}finally{setBusy(false);syncInFlight.current=null;}})();syncInFlight.current=run;return run;},[refresh]);
  const prepare=useCallback(async()=>{if(!eventId)return;setBusy(true);try{setStatus((s)=>({...s,packageStatus:"PREPARING"}));await prepareEventForOffline(eventId);await refresh();}finally{setBusy(false);}},[eventId,refresh]);
  useEffect(()=>{let cancelled=false;void getOfflineRuntimeConfig().then((config)=>{if(!cancelled){setAutoSyncEnabled(config.autoSyncEnabled);setForceLocalAttendance(config.forceLocalAttendance);}}).catch(()=>{if(!cancelled){setAutoSyncEnabled(false);setForceLocalAttendance(false);}});return()=>{cancelled=true;};},[]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{if(!desktopApi()||autoSyncEnabled!==true)return;const delay=automaticSyncDelayMs(status);if(delay===null)return;const timer=window.setTimeout(()=>void sync(),delay);return()=>window.clearTimeout(timer);},[autoSyncEnabled,status,sync]);
  return {status,preparedEvent,pendingRecords,busy,autoSyncPaused:autoSyncEnabled===false,forceLocalAttendance,prepare,sync,refresh};
}
