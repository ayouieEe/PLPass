import {
  AlertCircle,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  ClipboardList,
  LayoutDashboard,
  ShieldCheck,
  UserCircle,
  Users,
  FileText,
  UserCheck,
  History
} from "lucide-react";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { RoleNavigationConfig } from "@/types/navigation";

export const ROLE_NAVIGATION: RoleNavigationConfig = {
  organizer: [
    { label: "Dashboard", path: APP_ROUTES.organizerDashboard, icon: LayoutDashboard, group: "Overview" },
    { label: "Events", path: APP_ROUTES.organizerEvents, icon: ClipboardList, group: "Events" },
    { label: "Create Event", path: APP_ROUTES.organizerCreateEvent, icon: CalendarCheck, group: "Events" },
    { label: "User Management", path: APP_ROUTES.organizerUsers, icon: Users, group: "Management" },
    { label: "Event Records", path: APP_ROUTES.organizerRecords, icon: UserCheck, group: "Events" },
    { label: "Correction Requests", path: APP_ROUTES.organizerCorrections, icon: AlertCircle, group: "Attendance" },
    { label: "Authentication Methods", path: APP_ROUTES.organizerReports, icon: FileText, group: "Insights" },
    { label: "Analytics Insights", path: APP_ROUTES.organizerAnalytics, icon: BarChart3, group: "Insights" },
    { label: "Audit Trail", path: APP_ROUTES.organizerAuditTrail, icon: History, group: "Administration" },
    { label: "Profile", path: APP_ROUTES.organizerProfile, icon: UserCircle, group: "Account" }
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
