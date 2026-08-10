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
      description: "Day-to-day workspace for live sessions, turnout forecasts, attendance trends, and feedback signals.",
      breadcrumbs: [rolePrefix, "Dashboard"]
    };
  }
  if (pathname === "/organizer/events/create") {
    return {
      title: "Create Event",
      description: "Set up and schedule a new event for attendance tracking.",
      breadcrumbs: [rolePrefix, "Events", "Create Event"]
    };
  }
  if (pathname === "/organizer/events") {
    return {
      title: "Event Management",
      description: "Manage, publish, and track all student events.",
      breadcrumbs: [rolePrefix, "Event Management"]
    };
  }
  if (pathname.startsWith("/organizer/events/")) {
    return {
      title: "Event Details",
      description: "View event configuration, enrolled participants, and sessions.",
      breadcrumbs: [rolePrefix, "Events", "Event Details"]
    };
  }
  if (pathname.startsWith("/organizer/sessions/")) {
    return {
      title: "Event Attendance",
      description: "Live check-in monitoring and session management.",
      breadcrumbs: [rolePrefix, "Sessions", "Live Attendance"]
    };
  }
  if (pathname === "/organizer/users") {
    return {
      title: "User Management",
      description: "Manage student accounts, academic catalog, and enrollment status.",
      breadcrumbs: [rolePrefix, "User Management"]
    };
  }
  if (pathname === "/organizer/records") {
    return {
      title: "Event Records",
      description: "Review completed attendance sessions, event details, feedback sentiment, and export reports.",
      breadcrumbs: [rolePrefix, "Event Records"]
    };
  }
  if (pathname === "/organizer/reports") {
    return {
      title: "Authentication Methods",
      description: "Review QR, facial, manual, and online attendance verification options.",
      breadcrumbs: [rolePrefix, "Authentication Methods"]
    };
  }
  if (pathname === "/organizer/corrections") {
    return {
      title: "Correction Requests",
      description: "Review student requests for attendance adjustment, check verification evidence, and issue approvals or rejections.",
      breadcrumbs: [rolePrefix, "Correction Requests"]
    };
  }
  if (pathname === "/organizer/analytics") {
    return {
      title: "Analytics Insights",
      description: "Comprehensive reporting, ML risk forecasts, turnout distributions, and student attendance insights.",
      breadcrumbs: [rolePrefix, "Analytics Insights"]
    };
  }
  if (pathname === "/organizer/profile") {
    return {
      title: "Organizer Profile",
      description: "Manage your profile details, notifications preferences, security credentials, and organization assignment.",
      breadcrumbs: [rolePrefix, "Profile"]
    };
  }

  // Student Routes
  if (pathname === "/student" || pathname === "/student/dashboard") {
    return {
      title: "Dashboard",
      description: "Overview of your events, attendance progress, and pending tasks.",
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
      description: "View details of selected event.",
      breadcrumbs: [rolePrefix, "Events", "Event Details"]
    };
  }
  if (pathname === "/student/attendance") {
    return {
      title: "My Attendance",
      description: "Review completed attendance records and required pending tasks.",
      breadcrumbs: [rolePrefix, "Attendance"]
    };
  }
  if (pathname === "/student/methods") {
    return {
      title: "Attendance Methods",
      description: "View QR access, backup verification, and attendance issue reporting.",
      breadcrumbs: [rolePrefix, "Methods"]
    };
  }
  if (pathname === "/student/request-history") {
    return {
      title: "Request History",
      description: "Track submitted requests and review status updates.",
      breadcrumbs: [rolePrefix, "Request History"]
    };
  }
  if (pathname === "/student/corrections") {
    return {
      title: "Correction Requests",
      description: "Submit attendance correction requests.",
      breadcrumbs: [rolePrefix, "Correction Requests"]
    };
  }
  if (pathname === "/student/profile") {
    return {
      title: "Student Profile",
      description: "Manage student profile.",
      breadcrumbs: [rolePrefix, "Profile"]
    };
  }

  // Shared Routes
  if (pathname === "/notifications") {
    return {
      title: "Notifications",
      description: "System notifications and alerts.",
      breadcrumbs: [rolePrefix, "Notifications"]
    };
  }
  if (pathname === "/profile") {
    return {
      title: "Profile",
      description: "Account settings and security parameters.",
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
