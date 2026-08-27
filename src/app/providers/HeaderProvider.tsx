import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { HeaderContext, type HeaderOverride } from "@/app/providers/HeaderContext";

export function HeaderProvider({ children }: { children: ReactNode }) {
  const [headerOverride, setHeaderOverride] = useState<HeaderOverride>({});
  const location = useLocation();

  useEffect(() => {
    setHeaderOverride({});
  }, [location.pathname]);

  const value = useMemo(
    () => ({ headerOverride, setHeaderOverride }),
    [headerOverride]
  );

  return <HeaderContext.Provider value={value}>{children}</HeaderContext.Provider>;
}
