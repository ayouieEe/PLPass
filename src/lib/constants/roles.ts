import type { UserRole } from "@/types/roles";

export const USER_ROLES = ["admin", "faculty", "organizer", "student"] as const satisfies readonly UserRole[];
