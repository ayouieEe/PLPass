export type AuditModule = 
  | "Authentication"
  | "User Management"
  | "Event Management"
  | "Authentication Methods"
  | "Analytics"
  | "Profile";

export type AuditAction = 
  // Authentication
  | "Login"
  | "Logout"
  | "Password Changed"
  // User Management
  | "Student Account Created"
  | "Student Account Updated"
  | "Student Account Activated"
  | "Student Account Deactivated"
  | "Student Credential Updated"
  // Event Management
  | "Event Created"
  | "Event Published"
  | "Event Updated"
  | "Event Cancelled"
  | "Session Started"
  | "Session Ended"
  | "Attendance Record Updated"
  | "Excused/Correction Request Approved"
  | "Excused/Correction Request Rejected"
  // Authentication Methods
  | "QR Code Regenerated"
  | "QR Code Disabled"
  | "Facial Enrollment Activated"
  | "Facial Enrollment Deactivated"
  | "Facial Re-enrollment Approved"
  // Analytics
  | "Analytics Report Exported"
  | "Attendance Report Exported"
  | "Student Report Exported"
  | "Event Summary Exported"
  // Profile
  | "Profile Updated"
  | "Profile Picture Changed";

export type AuditLog = {
  id: string;
  timestamp: string; // ISO 8601
  organizerId: string;
  organizerName: string;
  module: AuditModule;
  action: AuditAction;
  description: string;
  deviceInfo: string;
  studentId?: string;
  studentName?: string;
  eventId?: string;
  eventCode?: string;
  metadata?: Record<string, unknown>;
};

export type AuditLogFilter = {
  dateFrom?: string;
  dateTo?: string;
  module?: AuditModule;
  action?: AuditAction;
  organizerId?: string;
  studentId?: string;
  search?: string;
};
