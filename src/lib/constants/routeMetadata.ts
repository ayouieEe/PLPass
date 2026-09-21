import type { UserRole } from "@/types/roles";

export type RouteHeaderMeta = {
  title: string;
  description?: string;
  breadcrumbs: string[];
};

export function getRouteHeaderMeta(pathname: string, role: UserRole): RouteHeaderMeta {
  const rolePrefix = role[0].toUpperCase() + role.slice(1);

  if (pathname === "/admin" || pathname === "/admin/dashboard") return { title: "Admin Dashboard", description: "Institution-wide operational overview and administration.", breadcrumbs: ["Admin", "Dashboard"] };
  if (pathname === "/admin/users") return { title: "Users", description: "Manage Student, Organizer, and Admin accounts.", breadcrumbs: ["Admin", "Users"] };
  if (pathname === "/admin/events") return { title: "Events", description: "View and manage all events and approvals.", breadcrumbs: ["Admin", "Events"] };
  if (pathname === "/admin/attendance") return { title: "Attendance Records", description: "Review attendance across all events.", breadcrumbs: ["Admin", "Attendance"] };
  if (pathname === "/admin/credentials") return { title: "Authentication Methods", description: "Manage QR codes and facial recognition credentials for all students.", breadcrumbs: ["Admin", "Authentication Methods"] };
  if (pathname === "/admin/analytics") return { title: "Analytics", description: "Review institution-wide analytics.", breadcrumbs: ["Admin", "Analytics"] };
  if (pathname === "/admin/audit-logs") return { title: "Audit Logs", description: "Review all system activity.", breadcrumbs: ["Admin", "Audit Logs"] };
  if (pathname === "/admin/catalogs") return { title: "Academic Catalogs", description: "Manage academic and event catalogs.", breadcrumbs: ["Admin", "Catalogs"] };
  if (pathname === "/admin/settings") return { title: "System Settings", description: "Manage institution-wide policies.", breadcrumbs: ["Admin", "Settings"] };

  if (pathname === "/department" || pathname === "/department/dashboard") return { title: "Department Overview", description: "Review department events, participation, and branding.", breadcrumbs: ["Department Admin", "Dashboard"] };
  if (pathname === "/department/events") return { title: "Department Events", description: "Review events associated with your department.", breadcrumbs: ["Department Admin", "Events"] };
  if (pathname === "/department/credentials") return { title: "Authentication Methods", description: "Review QR and facial authentication status for students in your department.", breadcrumbs: ["Department Admin", "Authentication Methods"] };
  if (pathname === "/department/records" || pathname === "/department/attendance") return { title: "Event Records", description: "Review attendance records for department events.", breadcrumbs: ["Department Admin", "Event Records"] };
  if (pathname === "/department/analytics") return { title: "Analytics Insights", description: "Review attendance insights for your department.", breadcrumbs: ["Department Admin", "Analytics Insights"] };
  if (pathname === "/department/audit-logs") return { title: "Audit Logs", description: "Review activity within your department scope.", breadcrumbs: ["Department Admin", "Audit Logs"] };
  if (pathname === "/department/system-health") return { title: "System Health", description: "Check department-scoped data availability.", breadcrumbs: ["Department Admin", "System Health"] };
  if (pathname === "/department/settings") return { title: "Settings", description: "Manage settings for your assigned department.", breadcrumbs: ["Department Admin", "Settings"] };
  if (pathname === "/department/profile") return { title: "Profile", description: "Manage your department-admin profile.", breadcrumbs: ["Department Admin", "Profile"] };
  if (pathname === "/department/students") return { title: "Department Students", description: "Review students visible through your department scope.", breadcrumbs: ["Department Admin", "Students"] };
  if (pathname === "/department/branding") return { title: "Department Branding", description: "Manage branding for your assigned department.", breadcrumbs: ["Department Admin", "Branding"] };

  // Organizer Routes
  if (pathname === "/organizer" || pathname === "/organizer/dashboard") {
    return {
      title: "Dashboard",
      description: "See live sessions, event schedules, and attendance trends.",
      breadcrumbs: [rolePrefix, "Dashboard"]
    };
  }
  if (pathname === "/organizer/events/create") {
    return {
      title: "Create Event",
      description: "Set up an event and schedule attendance.",
      breadcrumbs: [rolePrefix, "Events", "Create Event"]
    };
  }
  if (pathname === "/organizer/events") {
    return {
      title: "Event Management",
      description: "Manage events and start attendance sessions.",
      breadcrumbs: [rolePrefix, "Event Management"]
    };
  }
  if (pathname.startsWith("/organizer/live-attendance/")) {
    return {
      title: "Live Attendance Session",
      description: "Record and monitor attendance during the active session.",
      breadcrumbs: [rolePrefix, "Live Attendance"]
    };
  }
  if (pathname.startsWith("/organizer/events/")) {
    return {
      title: "Event Details",
      description: "Review event details, participants, and attendance sessions.",
      breadcrumbs: [rolePrefix, "Events", "Event Details"]
    };
  }
  if (pathname === "/organizer/users") {
    return {
      title: "User Management",
      description: "Manage student accounts and enrollment details.",
      breadcrumbs: [rolePrefix, "User Management"]
    };
  }
  if (pathname === "/organizer/records") {
    return {
      title: "Event Records",
      description: "Review completed events and attendance records.",
      breadcrumbs: [rolePrefix, "Event Records"]
    };
  }
  if (pathname === "/organizer/settings") {
    return {
      title: "Settings",
      description: "Manage preferences for your Organizer account.",
      breadcrumbs: [rolePrefix, "Settings"]
    };
  }
  if (pathname === "/organizer/audit-logs") {
    return {
      title: "Audit Logs",
      description: "See a history of important actions and changes.",
      breadcrumbs: [rolePrefix, "Audit Logs"]
    };
  }
  if (pathname === "/organizer/corrections") {
    return {
      title: "Correction Requests",
      description: "Review and process attendance correction requests.",
      breadcrumbs: [rolePrefix, "Correction Requests"]
    };
  }
  if (pathname === "/organizer/analytics") {
    return {
      title: "Analytics Insights",
      description: "Understand attendance trends, event turnout, and feedback.",
      breadcrumbs: [rolePrefix, "Analytics Insights"]
    };
  }
  if (pathname === "/organizer/profile") {
    return {
      title: "Organizer Profile",
      description: "Manage your organizer profile and account settings.",
      breadcrumbs: [rolePrefix, "Profile"]
    };
  }

  // Student Routes
  if (pathname === "/student" || pathname === "/student/dashboard") {
    return {
      title: "Dashboard",
      description: "See your events, attendance progress, and pending tasks.",
      breadcrumbs: [rolePrefix, "Dashboard"]
    };
  }
  if (pathname === "/student/schedule") {
    return {
      title: "My Schedule",
      description: "View upcoming classes and event schedules.",
      breadcrumbs: [rolePrefix, "Schedule"]
    };
  }
  if (pathname === "/student/events") {
    return {
      title: "Events",
      description: "Review ongoing and upcoming events assigned to you.",
      breadcrumbs: [rolePrefix, "Events"]
    };
  }
  if (pathname.startsWith("/student/events/")) {
    return {
      title: "Event Details",
      description: "Review event details, schedule, and attendance information.",
      breadcrumbs: [rolePrefix, "Events", "Event Details"]
    };
  }
  if (pathname === "/student/attendance") {
    return {
      title: "My Attendance",
      description: "Review your attendance records and complete pending tasks.",
      breadcrumbs: [rolePrefix, "Attendance"]
    };
  }
  if (pathname === "/student/methods") {
    return {
      title: "Attendance Methods",
      description: "View your attendance options and report verification issues.",
      breadcrumbs: [rolePrefix, "Methods"]
    };
  }
  if (pathname === "/student/request-history") {
    return {
      title: "Request History",
      description: "Track your requests and view their status.",
      breadcrumbs: [rolePrefix, "Request History"]
    };
  }
  if (pathname === "/student/corrections") {
    return {
      title: "Correction Requests",
      description: "Submit attendance corrections and absence notices.",
      breadcrumbs: [rolePrefix, "Correction Requests"]
    };
  }
  if (pathname === "/student/faqs") {
    return {
      title: "Frequently Asked Questions",
      description: "Find answers about your account, events, attendance, records, and requests.",
      breadcrumbs: [rolePrefix, "FAQs"]
    };
  }
  if (pathname === "/student/profile") {
    return {
      title: "Student Profile",
      description: "Manage your student details and attendance access.",
      breadcrumbs: [rolePrefix, "Profile"]
    };
  }
  if (pathname === "/student/legal-review") {
    return {
      title: "Account Agreements",
      description: "Review the PLPass Terms of Use and Privacy Policy.",
      breadcrumbs: [rolePrefix, "Account Agreements"]
    };
  }

  // Shared Routes
  if (pathname === "/notifications") {
    return {
      title: "Notifications",
      description: "Review updates about your attendance, requests, reports, and account.",
      breadcrumbs: [rolePrefix, "Notifications"]
    };
  }
  if (pathname === "/profile") {
    return {
      title: "Profile",
      description: "Manage your account details and settings.",
      breadcrumbs: [rolePrefix, "Profile"]
    };
  }

  // Fallback default
  return {
    title: `${rolePrefix} Dashboard`,
    description: "PLPass authenticated workspace",
    breadcrumbs: [rolePrefix, "Dashboard"]
  };
}
