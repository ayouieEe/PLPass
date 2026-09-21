import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react";
import {
  DevelopmentSessionContext,
  type DevelopmentSession,
  type DevelopmentSessionContextValue
} from "@/app/providers/developmentSessionContext";
import { queryClient } from "@/app/providers/queryClient";
import {
  authFailure,
  authTimeoutFailure,
  createSupabaseSessionReader,
  isInvalidCredentialAuthError,
  missingAuthSessionFailure,
  resolveSupabaseSessionUser,
  shouldSignOutAfterAuthFailure,
  toSafeAuthErrorMessage
} from "@/app/providers/supabaseSessionResolver";
import { RequestTimeoutError, withRequestTimeout } from "@/lib/async/requestTimeout";
import { isPageVisible, onPageVisibilityChange } from "@/lib/browser/visibilityControls";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { repositories } from "@/services/repositories";

function getManilaCalendarDate(at = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const supabaseAuthDeadlineMs = 12_000;
const desktopOfflineSessionMaxAgeMs = 24 * 60 * 60_000;
const dailyPackagePreparationRuns = new Set<string>();

function isDesktopOffline() {
  return Boolean(window.plpassDesktop) && !navigator.onLine;
}

async function cacheDesktopOfflineSession(session: DevelopmentSession) {
  if (!window.plpassDesktop || session.role !== "organizer" || session.accountStatus !== "active") return false;
  try {
    await window.plpassDesktop.saveOfflineOrganizerIdentity({userId:session.userId,role:"organizer",displayName:session.displayName,email:session.email,accountStatus:session.accountStatus,departmentId:session.departmentId});
    return true;
  } catch { return false; }
}

async function readDesktopOfflineSession(userId?: string) {
  try {
    if(!window.plpassDesktop)return null;
    const value=await window.plpassDesktop.getOfflineOrganizerIdentity(userId);
    if(!value||value.role!=="organizer"||!Number.isFinite(value.savedAt)||Date.now()-value.savedAt>desktopOfflineSessionMaxAgeMs)return null;
    return {userId:value.userId,isAuthenticated:true,role:value.role,displayName:value.displayName,email:value.email,accountStatus:value.accountStatus,departmentId:value.departmentId} satisfies DevelopmentSession;
  } catch {
    return null;
  }
}

export function DevelopmentSessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<DevelopmentSession | null>(null);
  const [isSessionRestored, setIsSessionRestored] = useState(false);
  const [authError, setAuthError] = useState<string | undefined>();
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [offlineResumeAvailable, setOfflineResumeAvailable] = useState(false);
  const [hasOfflineWork, setHasOfflineWork] = useState(false);
  const [offlineConflictCount, setOfflineConflictCount] = useState(0);
  const reconnectInFlight = useRef<Promise<boolean> | null>(null);
  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      if (import.meta.env.VITE_DATA_SOURCE === "mock" || import.meta.env.MODE === "test") {
        const stored = window.localStorage.getItem("plpass-development-session");
        if (stored) {
          try {
            const nextSession = JSON.parse(stored) as DevelopmentSession;
            if (nextSession.role !== "student" && nextSession.role !== "organizer" && nextSession.role !== "admin" && nextSession.role !== "department_admin") {
              if (isMounted) {
                setSession(null);
                setIsSessionRestored(true);
              }
              return;
            }
            if (isMounted) {
              setSession(nextSession);
              setIsSessionRestored(true);
            }
            return;
          } catch {
            // fallback to null session
          }
        }
        if (isMounted) {
          setSession(null);
          setIsSessionRestored(true);
        }
        return;
      }

      let supabase: ReturnType<typeof getSupabaseBrowserClient> | null = null;
      try {
        supabase = getSupabaseBrowserClient();
        // Supabase's getUser() verifies the token over the network. The desktop
        // must not make that call while offline: a matching, recently cached
        // organizer identity plus the persisted Supabase session is sufficient
        // to open the already-prepared local attendance package. Syncing still
        // requires a valid online Supabase session later.
        if (isDesktopOffline()) {
          // Offline recovery is intentionally based on the recent desktop
          // cache, not on a Supabase token lookup. The token may be absent or
          // expired while disconnected even though this desktop was recently
          // authenticated online.
          const offlineSession = await readDesktopOfflineSession();
          if (isMounted) {
            setOfflineResumeAvailable(Boolean(offlineSession));
            if (offlineSession) {
              // Restore the encrypted organizer identity immediately. This is
              // what makes an Electron refresh/relaunch work without asking
              // Supabase to validate a token over a connection that is down.
              queryClient.clear();
              setSession(offlineSession);
              setIsOfflineMode(true);
              setAuthError(undefined);
            } else {
              setAuthError("Offline access requires this organizer to sign in on this desktop while connected within the last 24 hours.");
              setSession(null);
              setIsOfflineMode(false);
            }
            setIsSessionRestored(true);
          }
          return;
        }
        const nextSession = await withRequestTimeout(
          (async () => {
            const { data, error } = await supabase.auth.getUser();
            if (error || !data.user) return null;
            return resolveSupabaseSessionUser(createSupabaseSessionReader(supabase), {
              id: data.user.id,
              email: data.user.email ?? ""
            });
          })(),
          supabaseAuthDeadlineMs,
          "Session restore took too long. Please sign in again."
        );
        if (isMounted) {
          setSession(nextSession);
          if (nextSession) void cacheDesktopOfflineSession(nextSession);
          setIsSessionRestored(true);
        }
      } catch (error) {
        if (isMounted) {
          if (window.plpassDesktop && supabase && !shouldSignOutAfterAuthFailure(error)) {
            try {
              const { data } = await supabase.auth.getSession();
              const offlineSession = await readDesktopOfflineSession(data.session?.user.id);
              setOfflineResumeAvailable(Boolean(offlineSession));
              if (offlineSession && !navigator.onLine) {
                queryClient.clear();
                setSession(offlineSession);
                setIsOfflineMode(true);
                setAuthError(undefined);
                setIsSessionRestored(true);
                return;
              }
            } catch { setOfflineResumeAvailable(false); }
          }
          queryClient.clear();
          if (shouldSignOutAfterAuthFailure(error) && supabase) {
            void supabase.auth.signOut();
          }
          setAuthError(error instanceof RequestTimeoutError ? error.message : toSafeAuthErrorMessage(error));
          setSession(null);
          setIsSessionRestored(true);
        }
      }
    }

    void restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  const refreshOfflineWork = useCallback(async () => {
    if (!session || session.role !== "organizer" || !window.plpassDesktop) { setHasOfflineWork(false); return false; }
    try {
      const [hasWork,pending,prepared]=await Promise.all([
        window.plpassDesktop.hasUnresolvedWork(session.userId),
        window.plpassDesktop.listPending(undefined,session.userId),
        window.plpassDesktop.listPreparedEvents(session.userId,getManilaCalendarDate())
      ]);
      setHasOfflineWork(hasWork);
      setOfflineConflictCount(pending.filter((record)=>record.syncStatus==="CONFLICT").length + prepared.filter((item)=>item.lifecycle==="CONFLICT").length);
      return hasWork;
    }
    catch { return hasOfflineWork; }
  }, [hasOfflineWork,session]);

  useEffect(() => { void refreshOfflineWork(); }, [refreshOfflineWork]);

  const continueOffline = useCallback(async () => {
    if (!window.plpassDesktop) return null;
    try {
      const cached = await readDesktopOfflineSession();
      if (!cached || cached.role !== "organizer") {
        setAuthError("Offline access is available only to the recently authenticated organizer on this desktop.");
        return null;
      }
      setSession(cached);
      setIsOfflineMode(true);
      setOfflineResumeAvailable(false);
      setAuthError(undefined);
      queryClient.clear();
      return cached;
    } catch {
      setAuthError("The saved organizer session is unavailable on this desktop.");
      return null;
    }
  }, []);

  const performOnlineReconnect = useCallback(async (forceRetry:boolean) => {
      if (!session || !window.plpassDesktop) return false;
      try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.getUser();
      if (error || data.user?.id !== session.userId) return false;
      const confirmed = await resolveSupabaseSessionUser(createSupabaseSessionReader(supabase), { id:data.user.id, email:data.user.email ?? session.email });
      if (!confirmed || confirmed.role !== "organizer") return false;
      await cacheDesktopOfflineSession(confirmed);
      setSession((current)=>JSON.stringify(current)===JSON.stringify(confirmed)?current:confirmed);
      setIsOfflineMode(false);
      const { reconcileOfflineEventLifecycle } = await import("@/features/offline/offlineService");
      const reconciliation = await reconcileOfflineEventLifecycle(confirmed.userId,true,forceRetry);
      const unresolved=await refreshOfflineWork();
      if (!reconciliation.completed) {
        setAuthError(reconciliation.message);
        return false;
      }
      setAuthError(undefined);
      return !unresolved;
      } catch { await refreshOfflineWork(); return false; }
  }, [refreshOfflineWork,session]);

  const reconnectOnline = useCallback((forceRetry=false):Promise<boolean> => {
    if (reconnectInFlight.current) {
      const current=reconnectInFlight.current;
      if(!forceRetry) return current;
      return current.then(async(complete)=>{
        if(complete) return true;
        const retry=performOnlineReconnect(true);
        reconnectInFlight.current=retry;
        try { return await retry; }
        finally { if(reconnectInFlight.current===retry) reconnectInFlight.current=null; }
      });
    }
    const reconnect=performOnlineReconnect(forceRetry).finally(()=>{reconnectInFlight.current=null;});
    reconnectInFlight.current=reconnect;
    return reconnect;
  }, [performOnlineReconnect]);

  // Keep offline work syncing while online even after navigating away from
  // the event page. Resume, reconnect, and bounded retry all use one flow.
  useEffect(() => {
    if (!session || session.role!=="organizer" || !window.plpassDesktop) return undefined;
    let disposed=false;
    let running=false;
    let retryTimer:number|undefined;
    const clearRetry=()=>{if(retryTimer!==undefined) window.clearTimeout(retryTimer);retryTimer=undefined;};
    const scheduleRetry=()=>{
      clearRetry();
      if(!disposed && navigator.onLine && document.visibilityState==="visible") retryTimer=window.setTimeout(()=>void attemptSync(false),30_000);
    };
    const attemptSync=async(forceRetry:boolean)=>{
      if(disposed || running || !navigator.onLine || document.visibilityState!=="visible") return;
      running=true; clearRetry();
      try {
        if(await refreshOfflineWork()) {
          const complete=await reconnectOnline(forceRetry);
          if(!complete && await refreshOfflineWork()) scheduleRetry();
        }
      } finally { running=false; }
    };
    const onOnline=()=>void attemptSync(false);
    window.addEventListener("online",onOnline);
    const removeVisibility=onPageVisibilityChange((visible)=>{
      if(visible) void attemptSync(false);
      else clearRetry();
    });
    void attemptSync(false);
    return ()=>{disposed=true;clearRetry();window.removeEventListener("online",onOnline);removeVisibility();};
  }, [reconnectOnline,refreshOfflineWork,session]);

  // Prepare today's owned events once, serially, after a confirmed online
  // organizer session. A persisted attempt marker prevents relaunch retry loops.
  useEffect(() => {
    if (!session || session.role !== "organizer" || isOfflineMode || !window.plpassDesktop || !navigator.onLine || import.meta.env.MODE === "test") return;
    let cancelled = false;
    const day = getManilaCalendarDate();
    const marker = `plpass-offline-package-attempts:${session.userId}:${day}`;
    const runKey = `${session.userId}:${day}`;
    const timer=window.setTimeout(()=>{
      if(cancelled || dailyPackagePreparationRuns.has(runKey)) return;
      dailyPackagePreparationRuns.add(runKey);
      void (async () => {
      try {
        const desktopApi=window.plpassDesktop;
        if(!desktopApi) return;
        const local = await desktopApi.listPreparedEvents(session.userId, day);
        const ready = new Set(local.map((item) => item.event.id));
        const prior = new Set<string>(JSON.parse(window.localStorage.getItem(marker) ?? "[]"));
        const page = await repositories.eventManagement.listEvents({ pageIndex: 0, pageSize: 100 }, { actorUserId:session.userId, actorRole:"organizer" });
        const candidates = [...page.items];
        for (let pageIndex=1; pageIndex<page.pageCount; pageIndex+=1) {
          if (cancelled) return;
          const nextPage = await repositories.eventManagement.listEvents({ pageIndex, pageSize: 100 }, { actorUserId:session.userId, actorRole:"organizer" });
          candidates.push(...nextPage.items);
        }
        const targets = candidates.filter((event) => ["approved", "ongoing"].includes(event.status) && getManilaCalendarDate(new Date(event.startsAt)) === day && !ready.has(event.id) && !prior.has(event.id));
        const { prepareEventForOffline } = await import("@/features/offline/offlineService");
        for (const event of targets) {
          if (cancelled) return;
          prior.add(event.id);
          window.localStorage.setItem(marker, JSON.stringify([...prior]));
          const failuresKey=`plpass-offline-package-failures:${session.userId}:${day}`;
          try {
            await prepareEventForOffline(event.id, session.userId);
            const failures=JSON.parse(window.localStorage.getItem(failuresKey)??"{}") as Record<string,string>;
            const remainingFailures=Object.fromEntries(Object.entries(failures).filter(([key])=>key!==event.id));window.localStorage.setItem(failuresKey,JSON.stringify(remainingFailures));
          } catch {
            const failures=JSON.parse(window.localStorage.getItem(failuresKey)??"{}") as Record<string,string>;
            failures[event.id]="Offline package preparation failed. Retry from Events while online.";
            window.localStorage.setItem(failuresKey,JSON.stringify(failures));
          }
        }
      } catch { /* A failure here does not create a retry loop. */ }
      })();
    },0);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [isOfflineMode, session]);

  useEffect(() => {
    if (!session || isOfflineMode || import.meta.env.VITE_DATA_SOURCE === "mock" || import.meta.env.MODE === "test") {
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const invalidationTimers = new Map<string, number>();
    const scheduleInvalidation = (queryKey: string[]) => {
      const key = JSON.stringify(queryKey);
      const existingTimer = invalidationTimers.get(key);
      if (existingTimer !== undefined) window.clearTimeout(existingTimer);
      const timer = window.setTimeout(() => {
        invalidationTimers.delete(key);
        void queryClient.invalidateQueries({ queryKey });
      }, 250);
      invalidationTimers.set(key, timer);
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: number | undefined;
    let retryAttempt = 0;
    let disposed = false;
    const subscribeNotifications = () => {
      if (disposed || !isPageVisible()) return;
      channel = supabase.channel(`plpass-notifications-${session.userId}-${retryAttempt}`);
      channel
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${session.userId}` }, () => scheduleInvalidation(["notifications"]))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${session.userId}` }, () => scheduleInvalidation(["notifications"]))
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            retryAttempt = 0;
            return;
          }
          if (!disposed && ["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
            const delay = Math.min(60_000, 1_000 * 2 ** retryAttempt);
            retryAttempt = Math.min(retryAttempt + 1, 6);
            retryTimer = window.setTimeout(() => {
              if (!isPageVisible()) return;
              if (channel) void supabase.removeChannel(channel);
              channel = null;
              subscribeNotifications();
            }, delay);
          }
        });
    };
    subscribeNotifications();
    const removeVisibilityListener = onPageVisibilityChange((visible) => {
      if (!visible) {
        if (retryTimer !== undefined) window.clearTimeout(retryTimer);
        retryTimer = undefined;
        if (channel) void supabase.removeChannel(channel);
        channel = null;
        return;
      }
      if (!channel) subscribeNotifications();
      scheduleInvalidation(["notifications"]);
    });

    return () => {
      invalidationTimers.forEach((timer) => window.clearTimeout(timer));
      invalidationTimers.clear();
      disposed = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      if (channel) void supabase.removeChannel(channel);
      removeVisibilityListener();
    };
  }, [isOfflineMode, session]);

  useEffect(() => {
    const handleOffline = async () => {
      if (!window.plpassDesktop || session?.role !== "organizer" || !(await readDesktopOfflineSession(session.userId))) return;
      queryClient.clear();
      setIsOfflineMode(true);
    };
    window.addEventListener("offline",handleOffline);
    return()=>window.removeEventListener("offline",handleOffline);
  }, [session]);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    setAuthError(undefined);
    queryClient.clear();
    if (import.meta.env.VITE_DATA_SOURCE === "mock" || import.meta.env.MODE === "test") {
      const accounts = await repositories.authentication.listDevelopmentAccounts();
      const account = accounts.find((candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase());
      if (!account || !password) {
        setAuthError(toSafeAuthErrorMessage(authFailure()));
        setSession(null);
        return null;
      }
      const nextSession: DevelopmentSession = {
        userId: account.userId,
        role: account.role,
        displayName: account.displayName,
        email: account.email,
        isAuthenticated: true
      };
      window.localStorage.setItem("plpass-development-session", JSON.stringify(nextSession));
      setSession(nextSession);
      setIsOfflineMode(false);
      setOfflineResumeAvailable(false);
      return nextSession;
    }
    if (isDesktopOffline()) {
      try {
        const offlineSession = await readDesktopOfflineSession();
        if (offlineSession && offlineSession.email.toLowerCase() === email.trim().toLowerCase()) {
          setSession(offlineSession);
          setIsOfflineMode(true);
          setOfflineResumeAvailable(false);
          setAuthError(undefined);
          queryClient.clear();
          return offlineSession;
        }
      } catch {
        // Fall through to the same safe, explicit offline-access message.
      }
      setAuthError("Offline sign-in is available only for the organizer identity recently verified on this desktop. Enter that organizer's email or reconnect to sign in online.");
      setSession(null);
      return null;
    }
    let supabase: ReturnType<typeof getSupabaseBrowserClient> | null = null;
    try {
      supabase = getSupabaseBrowserClient();
      const nextSession = await withRequestTimeout(
        (async () => {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) {
            // Keep transport/provider errors intact; only normalize the
            // explicit invalid-credentials response as a credential failure.
            throw isInvalidCredentialAuthError(error) ? authFailure() : error;
          }
          if (!data.session?.user) throw missingAuthSessionFailure();
          return resolveSupabaseSessionUser(createSupabaseSessionReader(supabase), {
            id: data.session.user.id,
            email: data.session.user.email ?? ""
          });
        })(),
        supabaseAuthDeadlineMs,
        "Sign-in took too long. Check your connection and try again."
      );
      setSession(nextSession);
      setIsOfflineMode(false);
      setOfflineResumeAvailable(false);
      const savedOffline=await cacheDesktopOfflineSession(nextSession);
      setOfflineResumeAvailable(savedOffline);
      return nextSession;
    } catch (error) {
      const resolvedError = error instanceof RequestTimeoutError ? authTimeoutFailure() : error;
      const message = toSafeAuthErrorMessage(resolvedError);
      queryClient.clear();
      if (shouldSignOutAfterAuthFailure(resolvedError) && supabase) {
        void supabase.auth.signOut();
      }
      setAuthError(message);
      setSession(null);
      return null;
    }
  }, []);

  const logout = useCallback(async () => {
    const wasOffline = isOfflineMode;
    if (wasOffline && session?.role === "organizer" && window.plpassDesktop && await window.plpassDesktop.hasUnresolvedWork(session.userId)) {
      throw new Error("Sync or resolve the saved offline event before logging out. Your local records have been kept.");
    }
    queryClient.clear();
    window.localStorage.removeItem("plpass-development-session");
    window.localStorage.removeItem("plpass-desktop-offline-session");
    await window.plpassDesktop?.clearOfflineOrganizerIdentity();
    setSession(null);
    setIsOfflineMode(false);
    setOfflineResumeAvailable(false);
    setHasOfflineWork(false);
    setIsOfflineMode(false);
    setOfflineResumeAvailable(false);
    if (wasOffline || import.meta.env.VITE_DATA_SOURCE === "mock" || import.meta.env.MODE === "test") return;
    const { error } = await getSupabaseBrowserClient().auth.signOut();
    if (error) throw error;
  }, [isOfflineMode,session]);

  const value = useMemo<DevelopmentSessionContextValue>(
    () => ({ session, isSessionRestored, isOfflineMode, offlineResumeAvailable, hasOfflineWork, offlineConflictCount, authError, signInWithPassword, continueOffline, reconnectOnline, refreshOfflineWork, logout }),
    [authError, continueOffline, hasOfflineWork, offlineConflictCount, isOfflineMode, isSessionRestored, logout, offlineResumeAvailable, reconnectOnline, refreshOfflineWork, session, signInWithPassword]
  );

  return <DevelopmentSessionContext.Provider value={value}>{children}</DevelopmentSessionContext.Provider>;
}
