import type { LucideIcon } from "lucide-react";
import type { UserRole } from "@/types/roles";

export type NavigationItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  description?: string;
};

export type RoleNavigationConfig = Record<UserRole, NavigationItem[]>;
