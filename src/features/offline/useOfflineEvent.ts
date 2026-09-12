import { useCallback, useEffect, useState } from "react";
import { desktopApi, confirmSupabaseConnectivity, prepareEventForOffline, synchronizePendingAttendance } from "./offlineService";
import type { OfflineStatus, PreparedEventPackage } from "./types";
import { automaticSyncDelayMs } from "./autoSyncPolicy";

const unavailable: OfflineStatus={runtimeAvailable:false,connectivity:"checking",packageStatus:"NOT_PREPARED",pendingCount:0,retryCount:0,conflictCount:0,syncingCount:0};

export function useOfflineEvent(eventId?:string,sessionId?:string){
  const [status,setStatus]=useState<OfflineStatus>(unavailable); const [busy,setBusy]=useState(false);
  const [preparedEvent,setPreparedEvent]=useState<PreparedEventPackage|null>(null);
  const refresh=useCallback(async()=>{ const api=desktopApi(); if(!api){setStatus({...unavailable,connectivity:(await confirmSupabaseConnectivity())?"online":"offline"});return;} const pkg=eventId?await api.getPreparedEvent(eventId):sessionId?await api.getPreparedEventBySession(sessionId):null; const resolvedId=eventId??pkg?.event.id; if(!resolvedId){setPreparedEvent(null);setStatus({...unavailable,runtimeAvailable:true,connectivity:(await confirmSupabaseConnectivity())?"online":"offline"});return;} const [local,online]=await Promise.all([api.getStatus(resolvedId),confirmSupabaseConnectivity()]); setPreparedEvent(pkg);setStatus({...local,connectivity:online?"online":"offline"}); },[eventId,sessionId]);
  const sync=useCallback(async(forceRetry=false)=>{setBusy(true);try{await synchronizePendingAttendance(20,forceRetry);await refresh();}finally{setBusy(false);}},[refresh]);
  const prepare=useCallback(async()=>{if(!eventId)return;setBusy(true);try{setStatus((s)=>({...s,packageStatus:"PREPARING"}));await prepareEventForOffline(eventId);await refresh();}finally{setBusy(false);}},[eventId,refresh]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{if(!desktopApi())return;const delay=automaticSyncDelayMs(status);if(delay===null)return;const timer=window.setTimeout(()=>void sync(),delay);return()=>window.clearTimeout(timer);},[status,sync]);
  return {status,preparedEvent,busy,prepare,sync,refresh};
}
