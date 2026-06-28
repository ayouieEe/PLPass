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
import { getDataSource, isSupabaseDataSource } from "@/lib/config/dataSource";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const storageKey = "plpass-development-session";

function isDevelopmentSession(value: unknown): value is DevelopmentSession {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Partial<DevelopmentSession>;
  return (
    typeof candidate.userId === "string" &&
    typeof candidate.displayName === "string" &&
    typeof candidate.email === "string" &&
    candidate.isAuthenticated === true &&
    (candidate.role === "admin" ||
      candidate.role === "faculty" ||
      candidate.role === "organizer" ||
      candidate.role === "student")
  );
}

function readStoredSession(): DevelopmentSession | null {
  const rawSession = window.localStorage.getItem(storageKey);
  if (!rawSession) {
    return null;
  }

  try {
    const parsedSession: unknown = JSON.parse(rawSession);
    return isDevelopmentSession(parsedSession) ? parsedSession : null;
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
  }
}

export function DevelopmentSessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<DevelopmentSession | null>(null);
  const [isSessionRestored, setIsSessionRestored] = useState(false);
  const [authError, setAuthError] = useState<string | undefined>();
  const isSupabaseMode = isSupabaseDataSource();

  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      if (getDataSource() !== "supabase") {
        setSession(readStoredSession());
        setIsSessionRestored(true);
        return;
      }

      let supabase: ReturnType<typeof getSupabaseBrowserClient> | null = null;
      try {
        supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          if (isMounted) {
            setSession(null);
            setIsSessionRestored(true);
          }
          return;
        }
        const nextSession = await resolveSupabaseSessionUser(createSupabaseSessionReader(supabase), { id: data.user.id, email: data.user.email ?? "" });
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

  const signIn = useCallback((nextSession: DevelopmentSession) => {
    setAuthError(undefined);
    const sessionToStore = { ...nextSession, isAuthenticated: true };
    queryClient.clear();
    if (!isSupabaseMode) {
      window.localStorage.setItem(storageKey, JSON.stringify(sessionToStore));
    }
    setSession(sessionToStore);
  }, [isSupabaseMode]);

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
    window.localStorage.removeItem(storageKey);
    if (isSupabaseMode) {
      void getSupabaseBrowserClient().auth.signOut();
    }
    setSession(null);
  }, [isSupabaseMode]);

  const value = useMemo<DevelopmentSessionContextValue>(
    () => ({ session, isSessionRestored, isSupabaseMode, authError, signIn, signInWithPassword, logout }),
    [authError, isSessionRestored, isSupabaseMode, logout, session, signIn, signInWithPassword]
  );

  return <DevelopmentSessionContext.Provider value={value}>{children}</DevelopmentSessionContext.Provider>;
}
