import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import {
  DevelopmentSessionContext,
  type DevelopmentSession,
  type DevelopmentSessionContextValue
} from "@/app/providers/developmentSessionContext";
import { queryClient } from "@/app/providers/queryClient";
import {
  authFailure,
  createSupabaseSessionReader,
  missingAuthSessionFailure,
  resolveSupabaseSessionUser,
  shouldSignOutAfterAuthFailure,
  toSafeAuthErrorMessage
} from "@/app/providers/supabaseSessionResolver";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const supabaseRestoreTimeoutMs = 8000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        window.clearTimeout(timeout);
        resolve(value);
      })
      .catch((error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      });
  });
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
            if (nextSession.role !== "student" && nextSession.role !== "organizer") {
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
        const { data, error } = await withTimeout(
          supabase.auth.getUser(),
          supabaseRestoreTimeoutMs,
          "Supabase session restore timed out. Please sign in again."
        );
        if (error || !data.user) {
          if (isMounted) {
            setSession(null);
            setIsSessionRestored(true);
          }
          return;
        }
        const nextSession = await withTimeout(
          resolveSupabaseSessionUser(createSupabaseSessionReader(supabase), { id: data.user.id, email: data.user.email ?? "" }),
          supabaseRestoreTimeoutMs,
          "Supabase account resolution timed out. Please sign in again."
        );
        if (isMounted) {
          setSession(nextSession);
          setIsSessionRestored(true);
        }
      } catch (error) {
        if (isMounted) {
          queryClient.clear();
          if (shouldSignOutAfterAuthFailure(error) && supabase) {
            void supabase.auth.signOut();
          }
          setAuthError(toSafeAuthErrorMessage(error));
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

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    setAuthError(undefined);
    queryClient.clear();
    let supabase: ReturnType<typeof getSupabaseBrowserClient> | null = null;
    try {
      supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw authFailure(error.message);
      }
      if (!data.session?.user) {
        throw missingAuthSessionFailure();
      }
      const nextSession = await resolveSupabaseSessionUser(createSupabaseSessionReader(supabase), {
        id: data.session.user.id,
        email: data.session.user.email ?? ""
      });
      setSession(nextSession);
      return nextSession;
    } catch (error) {
      const message = toSafeAuthErrorMessage(error);
      queryClient.clear();
      if (shouldSignOutAfterAuthFailure(error) && supabase) {
        void supabase.auth.signOut();
      }
      setAuthError(message);
      setSession(null);
      return null;
    }
  }, []);

  const logout = useCallback(() => {
    queryClient.clear();
    void getSupabaseBrowserClient().auth.signOut();
    window.localStorage.removeItem("plpass-development-session");
    setSession(null);
  }, []);

  const value = useMemo<DevelopmentSessionContextValue>(
    () => ({ session, isSessionRestored, authError, signInWithPassword, logout }),
    [authError, isSessionRestored, logout, session, signInWithPassword]
  );

  return <DevelopmentSessionContext.Provider value={value}>{children}</DevelopmentSessionContext.Provider>;
}
