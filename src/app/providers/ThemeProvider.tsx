import { useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { ThemeContext, type Theme, type ThemeContextValue } from "@/app/providers/themeContext";
const storageKey = "plpass-theme";

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const savedTheme = window.localStorage.getItem(storageKey);
    return isTheme(savedTheme) ? savedTheme : "system";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedTheme = theme === "system" ? (prefersDark ? "dark" : "light") : theme;

    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (nextTheme) => {
        window.localStorage.setItem(storageKey, nextTheme);
        setThemeState(nextTheme);
      }
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

function isTheme(value: string | null): value is Theme {
  return value === "light" || value === "dark" || value === "system";
}
