import { createContext, useContext, type ReactNode } from "react";

export type HeaderOverride = {
  title?: string;
  description?: string;
  breadcrumbs?: string[];
  primaryAction?: ReactNode;
};

export type HeaderContextType = {
  headerOverride: HeaderOverride;
  setHeaderOverride: (override: HeaderOverride) => void;
};

export const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

export function useHeader() {
  const context = useContext(HeaderContext);
  if (!context) {
    return {
      headerOverride: {},
      setHeaderOverride: () => {}
    };
  }
  return context;
}
