import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import {
  DevelopmentSessionContext,
  type DevelopmentSession,
  type DevelopmentSessionContextValue
} from "@/app/providers/developmentSessionContext";
import { queryClient } from "@/app/providers/queryClient";
import { getDataSource, isSupabaseDataSource } from "@/lib/config/dataSource";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { mapProfileToUser } from "@/lib/supabase/mappers";

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

      try {
        const supabase = getSupabaseBrowserClient();
        const { data, error } = await supabase.auth.getUser();
        if (error || !data.user) {
          if (isMounted) {
            setSession(null);
            setIsSessionRestored(true);
          }
          return;
        }
        const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
        if (profileError || !profile) {
          throw profileError ?? new Error("Supabase profile was not found.");
        }
        const mappedUser = mapProfileToUser({ ...(profile as Record<string, unknown>), email: data.user.email ?? "" });
        const accountStatus = typeof (profile as Record<string, unknown>).account_status === "string" ? String((profile as Record<string, unknown>).account_status) : "active";
        if (accountStatus === "inactive" || accountStatus === "suspended") {
          throw new Error(`Your PLPass account is ${accountStatus}. Contact an administrator for access.`);
        }
        if (isMounted) {
          setSession({
            userId: mappedUser.id,
            role: mappedUser.role,
            displayName: mappedUser.displayName,
            email: mappedUser.email,
            isAuthenticated: true,
            accountStatus: "active"
          });
          setIsSessionRestored(true);
        }
      } catch (error) {
        if (isMounted) {
          setAuthError(error instanceof Error ? error.message : "Unable to restore Supabase session.");
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
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw error;
      }
      if (!data.user) {
        throw new Error("Supabase did not return an authenticated user.");
      }
      const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", data.user.id).maybeSingle();
      if (profileError || !profile) {
        throw profileError ?? new Error("Supabase profile was not found.");
      }
      const profileRow = profile as Record<string, unknown>;
      const accountStatus = typeof profileRow.account_status === "string" ? profileRow.account_status : "active";
      if (accountStatus === "inactive" || accountStatus === "suspended") {
        await supabase.auth.signOut();
        throw new Error(`Your PLPass account is ${accountStatus}. Contact an administrator for access.`);
      }
      const mappedUser = mapProfileToUser({ ...profileRow, email: data.user.email ?? "" });
      const nextSession: DevelopmentSession = {
        userId: mappedUser.id,
        role: mappedUser.role,
        displayName: mappedUser.displayName,
        email: mappedUser.email,
        isAuthenticated: true,
        accountStatus: "active"
      };
      setSession(nextSession);
      return nextSession;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Supabase sign in failed.";
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
