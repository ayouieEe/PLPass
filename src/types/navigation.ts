import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/types/roles";
import type { Capability } from "@/lib/auth/permissions";

export type NavigationItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  group?: string;
  description?: string;
  capability?: Capability | readonly Capability[];
};

export type RoleNavigationConfig = Partial<Record<UserRole, NavigationItem[]>>;
