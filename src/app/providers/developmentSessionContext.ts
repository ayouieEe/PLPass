import { createContext } from "react";
import type { UserRole } from "@/types/roles";

export type DevelopmentSession = {
  isAuthenticated: boolean;
  role: UserRole;
  displayName: string;
};

export type DevelopmentSessionContextValue = {
  session: DevelopmentSession;
};

export const DevelopmentSessionContext = createContext<DevelopmentSessionContextValue | null>(null);
