import { createContext } from "react";
import type { UserRole } from "@/types/roles";

export type DevelopmentSession = {
  userId: string;
  isAuthenticated: boolean;
  role: UserRole;
  displayName: string;
  email: string;
};

export type DevelopmentSessionContextValue = {
  session: DevelopmentSession | null;
  isSessionRestored: boolean;
  signIn: (session: DevelopmentSession) => void;
  logout: () => void;
};

export const DevelopmentSessionContext = createContext<DevelopmentSessionContextValue | null>(null);
