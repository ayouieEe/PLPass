import { useContext } from "react";
import { DevelopmentSessionContext } from "@/app/providers/developmentSessionContext";

export function useDevelopmentSession() {
  const context = useContext(DevelopmentSessionContext);

  if (!context) {
    throw new Error("useDevelopmentSession must be used within DevelopmentSessionProvider.");
  }

  return context;
}
