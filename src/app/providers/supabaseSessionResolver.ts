import type { SupabaseClient } from "@supabase/supabase-js";
import type { DevelopmentSession } from "@/app/providers/developmentSessionContext";
import type { Database } from "@/lib/supabase/database.types";
import { mapProfileToUser } from "@/lib/supabase/mappers";
import type { UserRole } from "@/types/roles";

export type SupabaseAuthFailureCode =
  | "AUTH_FAILED"
  | "AUTH_SESSION_MISSING"
  | "PROFILE_MISSING"
  | "ACCOUNT_INACTIVE"
  | "STUDENT_RECORD_MISSING"
  | "FACULTY_RECORD_MISSING"
  | "ORGANIZER_RECORD_MISSING"
  | "DEAN_ASSIGNMENT_MISSING"
  | "ROLE_RECORD_MULTIPLE"
  | "RLS_PERMISSION_DENIED"
  | "DATABASE_QUERY_FAILED"
  | "MAPPER_ERROR"
  | "UNEXPECTED_RESOLVER_ERROR";

export class SupabaseAuthResolutionError extends Error {
  constructor(
    readonly code: SupabaseAuthFailureCode,
    message: string,
    readonly shouldSignOut: boolean
  ) {
    super(message);
    this.name = "SupabaseAuthResolutionError";
  }
}

type SupabaseAuthUser = {
  id: string;
  email?: string;
};

type SupabaseQueryResult<T> = {
  data: T | null;
  error: unknown;
};

type RoleRecord = {
  id: string;
  profile_id?: string | null;
  employee_id?: string | null;
  department_id?: string | null;
  faculty_status?: string | null;
  organizer_status?: string | null;
  student_id?: string | null;
  student_status?: string | null;
};

type DeanAssignmentRecord = {
  id: string;
  department_id: string;
};

export type SupabaseSessionReader = {
  readProfile: (userId: string) => Promise<SupabaseQueryResult<Record<string, unknown>>>;
  readStudentRecord: (userId: string) => Promise<SupabaseQueryResult<RoleRecord>>;
  readFacultyRecord: (userId: string) => Promise<SupabaseQueryResult<RoleRecord>>;
  readOrganizerRecord: (userId: string) => Promise<SupabaseQueryResult<RoleRecord>>;
  readDeanAssignments: (userId: string) => Promise<SupabaseQueryResult<DeanAssignmentRecord[]>>;
};

function safeQueryErrorMessage(error: unknown) {
  const code = supabaseErrorCode(error);
  return code ? `Database query failed during account resolution. Supabase code: ${code}.` : "Database query failed during account resolution.";
}

function supabaseErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}

function supabaseErrorText(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }
  const values: string[] = [];
  for (const key of ["message", "details", "hint"]) {
    if (key in error && typeof error[key as keyof typeof error] === "string") {
      values.push(String(error[key as keyof typeof error]));
    }
  }
  return values.join(" ").toLowerCase();
}

function isRlsPermissionError(error: unknown) {
  const code = supabaseErrorCode(error);
  const text = supabaseErrorText(error);
  return code === "42501" || text.includes("row-level security") || text.includes("permission denied");
}

function isMultipleRowsError(error: unknown) {
  const code = supabaseErrorCode(error);
  const text = supabaseErrorText(error);
  return code === "PGRST116" && (text.includes("multiple") || text.includes("more than 1") || text.includes("contains 2"));
}

function databaseQueryError(error: unknown): SupabaseAuthResolutionError {
  if (isRlsPermissionError(error)) {
    const code = supabaseErrorCode(error);
    return new SupabaseAuthResolutionError(
      "RLS_PERMISSION_DENIED",
      code ? `Role record query was denied by database permissions. Supabase code: ${code}.` : "Role record query was denied by database permissions.",
      false
    );
  }
  if (isMultipleRowsError(error)) {
    const code = supabaseErrorCode(error);
    return new SupabaseAuthResolutionError(
      "ROLE_RECORD_MULTIPLE",
      code ? `Role record query returned multiple rows. Supabase code: ${code}.` : "Role record query returned multiple rows.",
      true
    );
  }
  return new SupabaseAuthResolutionError("DATABASE_QUERY_FAILED", safeQueryErrorMessage(error), false);
}

export function toSafeAuthErrorMessage(error: unknown) {
  if (error instanceof SupabaseAuthResolutionError) {
    return `${error.message} [${error.code}]`;
  }
  if (error instanceof Error) {
    return `${error.message} [UNEXPECTED_RESOLVER_ERROR]`;
  }
  return "Unexpected resolver error. [UNEXPECTED_RESOLVER_ERROR]";
}

export function shouldSignOutAfterAuthFailure(error: unknown) {
  if (error instanceof SupabaseAuthResolutionError) {
    return error.shouldSignOut;
  }
  return true;
}

export function authFailure(message: string): SupabaseAuthResolutionError {
  return new SupabaseAuthResolutionError("AUTH_FAILED", message, false);
}

export function missingAuthSessionFailure(): SupabaseAuthResolutionError {
  return new SupabaseAuthResolutionError("AUTH_SESSION_MISSING", "Supabase did not return an authenticated session.", true);
}

export function createSupabaseSessionReader(supabase: SupabaseClient<Database>): SupabaseSessionReader {
  return {
    async readProfile(userId) {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
      return { data: data as Record<string, unknown> | null, error };
    },
    async readStudentRecord(userId) {
      const { data, error } = await supabase
        .from("students")
        .select("id, profile_id, student_id, section_id, student_status")
        .eq("profile_id", userId)
        .maybeSingle();
      return { data, error };
    },
    async readFacultyRecord(userId) {
      const { data, error } = await supabase
        .from("faculty")
        .select("id, profile_id, employee_id, department_id, faculty_status")
        .eq("profile_id", userId)
        .maybeSingle();
      return { data, error };
    },
    async readOrganizerRecord(userId) {
      const { data, error } = await supabase
        .from("organizers")
        .select("id, profile_id, employee_id, department_id, organizer_status")
        .eq("profile_id", userId)
        .maybeSingle();
      return { data, error };
    },
    async readDeanAssignments(userId) {
      const { data, error } = await supabase
        .from("dean_assignments")
        .select("id, department_id")
        .eq("profile_id", userId)
        .limit(100);
      return { data, error };
    }
  };
}

async function assertSupabaseRoleRecord(reader: SupabaseSessionReader, userId: string, role: UserRole) {
  if (role === "student") {
    const { data, error } = await reader.readStudentRecord(userId);
    if (error) {
      throw databaseQueryError(error);
    }
    if (!data) {
      throw new SupabaseAuthResolutionError("STUDENT_RECORD_MISSING", "No visible student record was returned for this Supabase profile.", true);
    }
    return;
  }

  if (role === "faculty") {
    const { data, error } = await reader.readFacultyRecord(userId);
    if (error) {
      throw databaseQueryError(error);
    }
    if (!data) {
      throw new SupabaseAuthResolutionError("FACULTY_RECORD_MISSING", "No visible faculty record was returned for this Supabase profile.", true);
    }
    return;
  }

  if (role === "organizer") {
    const { data, error } = await reader.readOrganizerRecord(userId);
    if (error) {
      throw databaseQueryError(error);
    }
    if (!data) {
      throw new SupabaseAuthResolutionError("ORGANIZER_RECORD_MISSING", "No visible organizer record was returned for this Supabase profile.", true);
    }
    return;
  }

  const { data, error } = await reader.readDeanAssignments(userId);
  if (error) {
    throw databaseQueryError(error);
  }
  if (!data || data.length === 0) {
    throw new SupabaseAuthResolutionError(
      "DEAN_ASSIGNMENT_MISSING",
      "No matching department-scoped Dean/Admin assignment was found for this Supabase profile.",
      true
    );
  }
}

export async function resolveSupabaseSessionUser(reader: SupabaseSessionReader, authUser: SupabaseAuthUser): Promise<DevelopmentSession> {
  try {
    const { data: profile, error: profileError } = await reader.readProfile(authUser.id);
    if (profileError) {
      throw databaseQueryError(profileError);
    }
    if (!profile) {
      throw new SupabaseAuthResolutionError("PROFILE_MISSING", "Supabase profile was not found.", true);
    }

    const accountStatus = typeof profile.account_status === "string" ? profile.account_status : "active";
    if (accountStatus === "inactive" || accountStatus === "suspended") {
      throw new SupabaseAuthResolutionError(
        "ACCOUNT_INACTIVE",
        `Your PLPass account is ${accountStatus}. Contact an administrator for access.`,
        true
      );
    }

    let mappedUser: ReturnType<typeof mapProfileToUser>;
    try {
      mappedUser = mapProfileToUser({ ...profile, email: authUser.email ?? "" });
    } catch {
      throw new SupabaseAuthResolutionError("MAPPER_ERROR", "Unexpected mapper error while resolving the signed-in profile.", true);
    }
    await assertSupabaseRoleRecord(reader, mappedUser.id, mappedUser.role);

    return {
      userId: mappedUser.id,
      role: mappedUser.role,
      displayName: mappedUser.displayName,
      email: mappedUser.email,
      isAuthenticated: true,
      accountStatus: "active"
    };
  } catch (error) {
    if (error instanceof SupabaseAuthResolutionError) {
      throw error;
    }
    throw new SupabaseAuthResolutionError("UNEXPECTED_RESOLVER_ERROR", "Unexpected resolver error.", true);
  }
}
