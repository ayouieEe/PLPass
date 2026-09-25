import { useCallback, useEffect, useRef, useState } from "react";
import { desktopApi, confirmSupabaseConnectivity, prepareEventForOffline, synchronizePendingAttendance } from "./offlineService";
import type { OfflineStatus, PreparedEventPackage } from "./types";
import { automaticSyncDelayMs } from "./autoSyncPolicy";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";

const unavailable: OfflineStatus={runtimeAvailable:false,connectivity:"checking",packageStatus:"NOT_PREPARED",pendingCount:0,retryCount:0,conflictCount:0,syncingCount:0};

export function useOfflineEvent(eventId?:string,sessionId?:string){
  const [status,setStatus]=useState<OfflineStatus>(unavailable); const [busy,setBusy]=useState(false);
  const [preparedEvent,setPreparedEvent]=useState<PreparedEventPackage|null>(null);
  const [lookupError,setLookupError]=useState<string|undefined>();
  const { session, isOfflineMode } = useDevelopmentSession();
  // A route can change from the Events list to a live session before Electron
  // has returned the package. Track the exact lookup rather than treating the
  // previous request's empty state as proof that the new session is missing.
  const requestKey=`${session?.userId??""}:${eventId?`event:${eventId}`:sessionId?`session:${sessionId}`:"none"}`;
  const [resolvedRequestKey,setResolvedRequestKey]=useState<string|null>(null);
  const lookupVersion=useRef(0);
  const isLoading=Boolean((eventId||sessionId)&&resolvedRequestKey!==requestKey);
  const refresh=useCallback(async()=>{
    const version=++lookupVersion.current;
    const isCurrent=()=>lookupVersion.current===version;
    const apply=(callback:()=>void)=>{ if(isCurrent()) callback(); };
    const api=desktopApi();
    try {
      apply(()=>setLookupError(undefined));
      if(!api){
        const online=await confirmSupabaseConnectivity();
        apply(()=>setStatus({...unavailable,connectivity:online?"online":"offline"}));
        return;
      }
      const owner=session?.userId??"";
      const pkg=eventId?await api.getPreparedEvent(eventId,owner):sessionId?await api.getPreparedEventBySession(sessionId,owner):null;
      const resolvedId=eventId??pkg?.event.id;
      if(!resolvedId){
        const online=isOfflineMode?false:await confirmSupabaseConnectivity();
        apply(()=>{
          setPreparedEvent(null);
          setStatus({...unavailable,runtimeAvailable:true,connectivity:online?"online":"offline"});
        });
        return;
      }
      const [local,online]=await Promise.all([api.getStatus(resolvedId,owner),isOfflineMode?Promise.resolve(false):confirmSupabaseConnectivity()]);
      apply(()=>{
        setPreparedEvent(pkg);
        setStatus({...local,connectivity:online?"online":"offline"});
      });
    } catch(error) {
      apply(()=>setLookupError(error instanceof Error ? error.message : "The prepared local session could not be read."));
    } finally {
      apply(()=>setResolvedRequestKey(requestKey));
    }
  },[eventId,isOfflineMode,requestKey,session?.userId,sessionId]);
  const sync=useCallback(async(forceRetry=false)=>{setBusy(true);try{await synchronizePendingAttendance(20,forceRetry,false,session?.userId);await refresh();}finally{setBusy(false);}},[refresh,session?.userId]);
  const prepare=useCallback(async()=>{if(!eventId||!session?.userId)return;setBusy(true);try{setStatus((s)=>({...s,packageStatus:"PREPARING"}));await prepareEventForOffline(eventId,session.userId);await refresh();}finally{setBusy(false);}},[eventId,refresh,session?.userId]);
  useEffect(()=>{void refresh();},[refresh]);
  useEffect(()=>{if(isOfflineMode||!navigator.onLine||!desktopApi())return;const delay=automaticSyncDelayMs(status);if(delay===null)return;const timer=window.setTimeout(()=>void sync(),delay);return()=>window.clearTimeout(timer);},[isOfflineMode,status,sync]);
  return {status,preparedEvent,busy,isLoading,lookupError,prepare,sync,refresh};
}
