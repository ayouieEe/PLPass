import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

export type HeaderOverride = {
  title?: string;
  description?: string;
  breadcrumbs?: string[];
  primaryAction?: ReactNode;
};

type HeaderContextType = {
  headerOverride: HeaderOverride;
  setHeaderOverride: (override: HeaderOverride) => void;
};

export const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [headerOverride, setHeaderOverride] = useState<HeaderOverride>({});
  const location = useLocation();

  useEffect(() => {
    setHeaderOverride({});
  }, [location.pathname]);

  return (
    <HeaderContext.Provider value={{ headerOverride, setHeaderOverride }}>
      {children}
    </HeaderContext.Provider>
  );
}

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
