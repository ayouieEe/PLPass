import type { UserRole } from "@/types/roles";

export type RouteHeaderMeta = {
  title: string;
  description?: string;
  breadcrumbs: string[];
};

export function getRouteHeaderMeta(pathname: string, role: UserRole): RouteHeaderMeta {
  const rolePrefix = role[0].toUpperCase() + role.slice(1);

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
  if (pathname.startsWith("/organizer/events/")) {
    return {
      title: "Event Details",
      description: "Review event details, participants, and attendance sessions.",
      breadcrumbs: [rolePrefix, "Events", "Event Details"]
    };
  }
  if (pathname.startsWith("/organizer/sessions/")) {
    return {
      title: "Event Attendance",
      description: "Monitor check-ins during a live attendance session.",
      breadcrumbs: [rolePrefix, "Sessions", "Live Attendance"]
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
  if (pathname === "/organizer/reports") {
    return {
      title: "Authentication Methods",
      description: "Manage the ways students verify attendance.",
      breadcrumbs: [rolePrefix, "Authentication Methods"]
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
  if (pathname === "/student/profile") {
    return {
      title: "Student Profile",
      description: "Manage your student details and attendance access.",
      breadcrumbs: [rolePrefix, "Profile"]
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
