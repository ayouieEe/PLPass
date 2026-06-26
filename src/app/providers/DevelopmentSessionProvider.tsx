import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import {
  DevelopmentSessionContext,
  type DevelopmentSession,
  type DevelopmentSessionContextValue
} from "@/app/providers/developmentSessionContext";

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

  useEffect(() => {
    setSession(readStoredSession());
    setIsSessionRestored(true);
  }, []);

  const signIn = useCallback((nextSession: DevelopmentSession) => {
    const sessionToStore = { ...nextSession, isAuthenticated: true };
    window.localStorage.setItem(storageKey, JSON.stringify(sessionToStore));
    setSession(sessionToStore);
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(storageKey);
    setSession(null);
  }, []);

  const value = useMemo<DevelopmentSessionContextValue>(
    () => ({ session, isSessionRestored, signIn, logout }),
    [isSessionRestored, logout, session, signIn]
  );

  return <DevelopmentSessionContext.Provider value={value}>{children}</DevelopmentSessionContext.Provider>;
}
