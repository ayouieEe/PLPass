import {
  BarChart3,
  CalendarCheck,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Nfc,
  Settings,
  ShieldCheck,
  UserCheck,
  Users
} from "lucide-react";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { RoleNavigationConfig } from "@/types/navigation";

export const ROLE_NAVIGATION: RoleNavigationConfig = {
  admin: [
    { label: "Dashboard", path: APP_ROUTES.dashboard, icon: LayoutDashboard },
    { label: "Users", path: "/admin/users", icon: Users },
    { label: "Classes", path: "/admin/classes", icon: GraduationCap },
    { label: "Reports", path: "/admin/reports", icon: FileText },
    { label: "Audit", path: "/admin/audit", icon: ShieldCheck },
    { label: "Settings", path: APP_ROUTES.admin, icon: Settings }
  ],
  faculty: [
    { label: "Dashboard", path: APP_ROUTES.dashboard, icon: LayoutDashboard },
    { label: "Classes", path: "/faculty/classes", icon: GraduationCap },
    { label: "Sessions", path: "/faculty/sessions", icon: CalendarCheck },
    { label: "NFC Attendance", path: "/faculty/nfc", icon: Nfc },
    { label: "Reports", path: "/faculty/reports", icon: FileText }
  ],
  organizer: [
    { label: "Dashboard", path: APP_ROUTES.dashboard, icon: LayoutDashboard },
    { label: "Events", path: "/organizer/events", icon: ClipboardList },
    { label: "Live Sessions", path: "/organizer/sessions", icon: CalendarCheck },
    { label: "Participants", path: "/organizer/participants", icon: UserCheck },
    { label: "Reports", path: "/organizer/reports", icon: FileText }
  ],
  student: [
    { label: "Dashboard", path: APP_ROUTES.dashboard, icon: LayoutDashboard },
    { label: "My Attendance", path: "/student/attendance", icon: CalendarCheck },
    { label: "Corrections", path: "/student/corrections", icon: ClipboardList },
    { label: "Analytics", path: "/student/analytics", icon: BarChart3 }
  ]
};
