import { createContext } from "react";
import type { UserRole } from "@/types/roles";

export type DevelopmentSession = {
  userId: string;
  isAuthenticated: boolean;
  role: UserRole;
  displayName: string;
  email: string;
  accountStatus?: "active" | "inactive" | "suspended";
  departmentId?: string;
};

export type DevelopmentSessionContextValue = {
  session: DevelopmentSession | null;
  isSessionRestored: boolean;
  isOfflineMode: boolean;
  offlineResumeAvailable: boolean;
  hasOfflineWork: boolean;
  authError?: string;
  continueOffline: () => Promise<DevelopmentSession | null>;
  reconnectOnline: () => Promise<boolean>;
  refreshOfflineWork: () => Promise<boolean>;
  signInWithPassword: (email: string, password: string) => Promise<DevelopmentSession | null>;
  logout: () => Promise<void>;
};

export const DevelopmentSessionContext = createContext<DevelopmentSessionContextValue | null>(null);
