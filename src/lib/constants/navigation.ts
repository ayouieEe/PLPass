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
  RadioTower,
  UserCircle,
  UserCheck,
  Users
} from "lucide-react";
import { APP_ROUTES } from "@/lib/constants/routes";
import type { RoleNavigationConfig } from "@/types/navigation";

export const ROLE_NAVIGATION: RoleNavigationConfig = {
  admin: [
    { label: "Dashboard", path: APP_ROUTES.adminDashboard, icon: LayoutDashboard, group: "Overview" },
    { label: "User Management", path: APP_ROUTES.adminUsers, icon: Users, group: "Management" },
    { label: "Academic Management", path: APP_ROUTES.adminAcademic, icon: GraduationCap, group: "Management" },
    { label: "Attendance Records", path: APP_ROUTES.adminAttendance, icon: CalendarCheck, group: "Attendance" },
    { label: "NFC Credentials", path: APP_ROUTES.adminNfcCredentials, icon: Nfc, group: "Attendance" },
    { label: "NFC Readers", path: APP_ROUTES.adminNfcReaders, icon: RadioTower, group: "Attendance" },
    { label: "Reports", path: APP_ROUTES.adminReports, icon: FileText, group: "Insights" },
    { label: "Analytics and ML", path: APP_ROUTES.adminAnalytics, icon: BarChart3, group: "Insights" },
    { label: "Audit Logs", path: APP_ROUTES.adminAuditLogs, icon: ShieldCheck, group: "System" },
    { label: "System Settings", path: APP_ROUTES.adminSettings, icon: Settings, group: "System" },
    { label: "Profile", path: APP_ROUTES.profile, icon: UserCircle, group: "Account" }
  ],
  faculty: [
    { label: "Dashboard", path: APP_ROUTES.facultyDashboard, icon: LayoutDashboard, group: "Overview" },
    { label: "My Classes", path: APP_ROUTES.facultyClasses, icon: GraduationCap, group: "Teaching" },
    { label: "Start Session", path: APP_ROUTES.facultyStartSession, icon: CalendarCheck, group: "Teaching" },
    { label: "Attendance Records", path: APP_ROUTES.facultyAttendance, icon: ClipboardList, group: "Attendance" },
    { label: "Correction Requests", path: APP_ROUTES.facultyCorrections, icon: UserCheck, group: "Attendance" },
    { label: "Reports", path: APP_ROUTES.facultyReports, icon: FileText, group: "Insights" },
    { label: "Analytics and ML", path: APP_ROUTES.facultyAnalytics, icon: BarChart3, group: "Insights" },
    { label: "Profile", path: APP_ROUTES.facultyProfile, icon: UserCircle, group: "Account" }
  ],
  organizer: [
    { label: "Dashboard", path: APP_ROUTES.organizerDashboard, icon: LayoutDashboard, group: "Overview" },
    { label: "Events", path: APP_ROUTES.organizerEvents, icon: ClipboardList, group: "Events" },
    { label: "Create Session", path: APP_ROUTES.organizerCreateEvent, icon: CalendarCheck, group: "Events" },
    { label: "Event Records", path: APP_ROUTES.organizerRecords, icon: UserCheck, group: "Events" },
    { label: "Reports", path: APP_ROUTES.organizerReports, icon: FileText, group: "Insights" },
    { label: "Analytics and ML", path: APP_ROUTES.organizerAnalytics, icon: BarChart3, group: "Insights" },
    { label: "Profile", path: APP_ROUTES.organizerProfile, icon: UserCircle, group: "Account" }
  ],
  student: [
    { label: "Dashboard", path: APP_ROUTES.studentDashboard, icon: LayoutDashboard, group: "Overview" },
    { label: "Attendance Methods", path: APP_ROUTES.studentMethods, icon: Nfc, group: "Verification" },
    { label: "Attendance Records", path: APP_ROUTES.studentAttendance, icon: CalendarCheck, group: "Attendance" },
    { label: "Correction Requests", path: APP_ROUTES.studentCorrections, icon: UserCheck, group: "Attendance" },
    { label: "Profile", path: APP_ROUTES.studentProfile, icon: UserCircle, group: "Account" }
  ]
};
