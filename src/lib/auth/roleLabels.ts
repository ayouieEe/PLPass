const ROLE_LABELS: Record<string, string> = {
  admin: "University Admin",
  department_admin: "Department Admin",
  organizer: "Organizer",
  student: "Student"
};

export function getUserRoleLabel(role: string) {
  return ROLE_LABELS[role] ?? "User";
}
