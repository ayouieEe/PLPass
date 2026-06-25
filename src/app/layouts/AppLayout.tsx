import { NavLink, Outlet } from "react-router-dom";
import { Activity, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { APP_ROUTES } from "@/lib/constants/routes";
import { cn } from "@/lib/utils/cn";

const navItems = [
  { href: "/", label: "Home" },
  { href: APP_ROUTES.components, label: "Components" },
  { href: APP_ROUTES.dashboard, label: "Dashboard" },
  { href: APP_ROUTES.admin, label: "Admin" }
];

export function AppLayout() {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div className="min-h-screen bg-background">
      <header className="plpass-top-nav">
        <div className="container flex min-h-16 items-center justify-between gap-4">
          <NavLink to="/" className="flex items-center gap-2 font-semibold">
            <Activity className="h-5 w-5 text-primary" aria-hidden="true" />
            <span>PLPass</span>
          </NavLink>
          <nav aria-label="Main navigation" className="flex items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.href}
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-highlight hover:text-highlight-foreground",
                    isActive && "plpass-nav-active"
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Toggle theme"
            onClick={() => setTheme(isDark ? "light" : "dark")}
          >
            {isDark ? <Sun className="h-4 w-4" aria-hidden="true" /> : <Moon className="h-4 w-4" aria-hidden="true" />}
          </Button>
        </div>
      </header>
      <main className="container py-8">
        <Outlet />
      </main>
    </div>
  );
}
