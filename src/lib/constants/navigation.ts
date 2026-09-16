import {
  AlertCircle,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  ShieldCheck,
  UserCircle,
  UserCheck,
  Settings
} from "lucide-react";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { RoleNavigationConfig } from "@/types/navigation";

export const ROLE_NAVIGATION: RoleNavigationConfig = {
  organizer: [
    { label: "Dashboard", path: APP_ROUTES.organizerDashboard, icon: LayoutDashboard, group: "Overview", capability: ["events.read.owned", "events.read.all"] },
    { label: "Events", path: APP_ROUTES.organizerEvents, icon: ClipboardList, group: "Events", capability: ["events.read.owned", "events.read.all"] },
    { label: "Create Event", path: APP_ROUTES.organizerCreateEvent, icon: CalendarCheck, group: "Events", capability: "events.create" },
    { label: "Event Records", path: APP_ROUTES.organizerRecords, icon: UserCheck, group: "Events", capability: ["attendance.read.owned", "attendance.read.all"] },
    { label: "Correction Requests", path: APP_ROUTES.organizerCorrections, icon: AlertCircle, group: "Attendance", capability: ["corrections.review.owned", "corrections.review.all"] },
    { label: "Analytics Insights", path: APP_ROUTES.organizerAnalytics, icon: BarChart3, group: "Insights", capability: ["analytics.read.owned", "analytics.read.all"] },
    { label: "Audit Logs", path: APP_ROUTES.organizerAuditLogs, icon: ClipboardList, group: "Account", capability: "audit.read.own" },
    { label: "Settings", path: APP_ROUTES.organizerSettings, icon: Settings, group: "Account", capability: "settings.manage.own" },
    { label: "Profile", path: APP_ROUTES.organizerProfile, icon: UserCircle, group: "Account", capability: "profile.manage.own" }
  ],
  // Admins have a separate centralized audit-log route. Organizer audit logs
  // remain scoped to the currently signed-in organizer.
  admin: [
    { label: "Dashboard", path: APP_ROUTES.adminDashboard, icon: LayoutDashboard, group: "Overview", capability: "system.health.read" },
    { label: "Users", path: APP_ROUTES.adminUsers, icon: UserCircle, group: "Administration", capability: "users.read.all" },
    { label: "Authentication Methods", path: APP_ROUTES.adminCredentials, icon: ShieldCheck, group: "Administration", capability: ["credentials.reset", "credentials.revoke"] },
    { label: "Events", path: APP_ROUTES.adminEvents, icon: ClipboardList, group: "Events", capability: "events.read.all" },
    { label: "Event Records", path: APP_ROUTES.adminAttendance, icon: UserCheck, group: "Events", capability: "attendance.read.all" },
    { label: "Correction Requests", path: APP_ROUTES.adminCorrections, icon: AlertCircle, group: "Attendance", capability: "corrections.review.all" },
    { label: "Analytics Insights", path: APP_ROUTES.adminAnalytics, icon: BarChart3, group: "Insights", capability: "analytics.read.all" },
    { label: "Audit Logs", path: APP_ROUTES.adminAuditLogs, icon: ClipboardList, group: "Account", capability: "audit.read.all" },
    { label: "System Health", path: APP_ROUTES.adminSystemHealth, icon: ShieldCheck, group: "Account", capability: "system.health.read" },
    { label: "Settings", path: APP_ROUTES.adminSettings, icon: Settings, group: "Account", capability: "system.settings.manage" },
    { label: "Profile", path: APP_ROUTES.adminProfile, icon: UserCircle, group: "Account", capability: "profile.manage.own" }
  ],
  student: [
    { label: "Dashboard", path: APP_ROUTES.studentDashboard, icon: LayoutDashboard, group: "Overview" },
    { label: "Events", path: APP_ROUTES.studentUpcomingEvents, icon: CalendarDays, group: "Events" },
    { label: "Attendance Methods", path: APP_ROUTES.studentMethods, icon: ShieldCheck, group: "Attendance" },
    { label: "Attendance Records", path: APP_ROUTES.studentAttendance, icon: CalendarCheck, group: "Attendance" },
    { label: "Request History", path: APP_ROUTES.studentRequestHistory, icon: ClipboardList, group: "Records" },
    { label: "Profile", path: APP_ROUTES.studentProfile, icon: UserCircle, group: "Account" }
  ]
};
