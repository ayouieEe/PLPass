import { useCallback, useEffect, useState } from "react";
import { desktopApi, confirmSupabaseConnectivity, prepareEventForOffline, synchronizePendingAttendance } from "./offlineService";
import type { OfflineStatus, PreparedEventPackage } from "./types";
import { automaticSyncDelayMs } from "./autoSyncPolicy";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";

const unavailable: OfflineStatus={runtimeAvailable:false,connectivity:"checking",packageStatus:"NOT_PREPARED",pendingCount:0,retryCount:0,conflictCount:0,syncingCount:0};

export function useOfflineEvent(eventId?:string,sessionId?:string){
  const [status,setStatus]=useState<OfflineStatus>(unavailable); const [busy,setBusy]=useState(false);
  const [preparedEvent,setPreparedEvent]=useState<PreparedEventPackage|null>(null);
  const { session, isOfflineMode } = useDevelopmentSession();
  const refresh=useCallback(async()=>{ const api=desktopApi(); if(!api){setStatus({...unavailable,connectivity:(await confirmSupabaseConnectivity())?"online":"offline"});return;} const owner=session?.userId??""; const pkg=eventId?await api.getPreparedEvent(eventId,owner):sessionId?await api.getPreparedEventBySession(sessionId,owner):null; const resolvedId=eventId??pkg?.event.id; if(!resolvedId){setPreparedEvent(null);setStatus({...unavailable,runtimeAvailable:true,connectivity:isOfflineMode?"offline":(await confirmSupabaseConnectivity())?"online":"offline"});return;} const [local,online]=await Promise.all([api.getStatus(resolvedId,owner),isOfflineMode?Promise.resolve(false):confirmSupabaseConnectivity()]); setPreparedEvent(pkg);setStatus({...local,connectivity:online?"online":"offline"}); },[eventId,isOfflineMode,session?.userId,sessionId]);
  const sync=useCallback(async(forceRetry=false)=>{setBusy(true);try{await synchronizePendingAttendance(20,forceRetry,false,session?.userId);await refresh();}finally{setBusy(false);}},[refresh,session?.userId]);
  const prepare=useCallback(async()=>{if(!eventId||!session?.userId)return;setBusy(true);try{setStatus((s)=>({...s,packageStatus:"PREPARING"}));await prepareEventForOffline(eventId,session.userId);await refresh();}finally{setBusy(false);}},[eventId,refresh,session?.userId]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{if(isOfflineMode||!navigator.onLine||!desktopApi())return;const delay=automaticSyncDelayMs(status);if(delay===null)return;const timer=window.setTimeout(()=>void sync(),delay);return()=>window.clearTimeout(timer);},[isOfflineMode,status,sync]);
  return {status,preparedEvent,busy,prepare,sync,refresh};
}
