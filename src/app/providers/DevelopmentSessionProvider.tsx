import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";
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

const supabaseAuthDeadlineMs = 12_000;
const desktopOfflineSessionKey = "plpass-desktop-offline-session";
const desktopOfflineSessionMaxAgeMs = 24 * 60 * 60_000;

type CachedDesktopOfflineSession = {
  session: DevelopmentSession;
  savedAt: number;
};

function isDesktopOffline() {
  return Boolean(window.plpassDesktop) && !navigator.onLine;
}

function cacheDesktopOfflineSession(session: DevelopmentSession) {
  if (!window.plpassDesktop || session.role !== "organizer") return;
  const value: CachedDesktopOfflineSession = { session, savedAt: Date.now() };
  window.localStorage.setItem(desktopOfflineSessionKey, JSON.stringify(value));
}

function readDesktopOfflineSession(userId: string | undefined) {
  try {
    const stored = window.localStorage.getItem(desktopOfflineSessionKey);
    if (!stored) return null;
    const value = JSON.parse(stored) as CachedDesktopOfflineSession;
    if (
      !value.session?.isAuthenticated ||
      value.session.role !== "organizer" ||
      value.session.userId !== userId ||
      !Number.isFinite(value.savedAt) ||
      Date.now() - value.savedAt > desktopOfflineSessionMaxAgeMs
    ) {
      return null;
    }
    return value.session;
  } catch {
    return null;
  }
}

export function DevelopmentSessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<DevelopmentSession | null>(null);
  const [isSessionRestored, setIsSessionRestored] = useState(false);
  const [authError, setAuthError] = useState<string | undefined>();
  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      if (import.meta.env.VITE_DATA_SOURCE === "mock" || import.meta.env.MODE === "test") {
        const stored = window.localStorage.getItem("plpass-development-session");
        if (stored) {
          try {
            const nextSession = JSON.parse(stored) as DevelopmentSession;
            if (nextSession.role !== "student" && nextSession.role !== "organizer" && nextSession.role !== "admin") {
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
          const { data } = await supabase.auth.getSession();
          const offlineSession = readDesktopOfflineSession(data.session?.user.id);
          if (offlineSession) {
            if (isMounted) {
              setSession(offlineSession);
              setIsSessionRestored(true);
            }
            return;
          }
          if (isMounted) {
            setAuthError("Offline access requires this organizer to sign in on this desktop while connected within the last 24 hours.");
            setSession(null);
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
          if (nextSession) cacheDesktopOfflineSession(nextSession);
          setIsSessionRestored(true);
        }
      } catch (error) {
        if (isMounted) {
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

  useEffect(() => {
    if (!session || import.meta.env.VITE_DATA_SOURCE === "mock" || import.meta.env.MODE === "test") {
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
      return nextSession;
    }
    if (isDesktopOffline()) {
      try {
        const supabase = getSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        const offlineSession = readDesktopOfflineSession(data.session?.user.id);
        if (offlineSession) {
          setSession(offlineSession);
          return offlineSession;
        }
      } catch {
        // Fall through to the same safe, explicit offline-access message.
      }
      setAuthError("Offline access requires this organizer to sign in on this desktop while connected within the last 24 hours.");
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
      cacheDesktopOfflineSession(nextSession);
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
    queryClient.clear();
    window.localStorage.removeItem("plpass-development-session");
    window.localStorage.removeItem(desktopOfflineSessionKey);
    setSession(null);
    if (import.meta.env.VITE_DATA_SOURCE === "mock" || import.meta.env.MODE === "test") return;
    const { error } = await getSupabaseBrowserClient().auth.signOut();
    if (error) throw error;
  }, []);

  const value = useMemo<DevelopmentSessionContextValue>(
    () => ({ session, isSessionRestored, authError, signInWithPassword, logout }),
    [authError, isSessionRestored, logout, session, signInWithPassword]
  );

  return <DevelopmentSessionContext.Provider value={value}>{children}</DevelopmentSessionContext.Provider>;
}
