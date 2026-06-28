import { createContext } from "react";
import type { UserRole } from "@/types/roles";

export type DevelopmentSession = {
  userId: string;
  isAuthenticated: boolean;
  role: UserRole;
  displayName: string;
  email: string;
  accountStatus?: "active" | "inactive" | "suspended";
};

export type DevelopmentSessionContextValue = {
  session: DevelopmentSession | null;
  isSessionRestored: boolean;
  isSupabaseMode: boolean;
  authError?: string;
  signIn: (session: DevelopmentSession) => void;
  signInWithPassword: (email: string, password: string) => Promise<DevelopmentSession | null>;
  logout: () => void;
};

export const DevelopmentSessionContext = createContext<DevelopmentSessionContextValue | null>(null);
