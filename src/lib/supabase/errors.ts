import type { AuthError, PostgrestError } from "@supabase/supabase-js";
import { RepositoryError } from "@/services/mock/mockRepositoryUtils";

export function mapSupabaseError(error: AuthError | PostgrestError | Error | null | undefined): RepositoryError {
  if (!error) {
    return new RepositoryError("Unexpected Supabase error.", "SERVER_ERROR");
  }

  const message = error.message || "Unexpected Supabase error.";
  const status = "status" in error ? error.status : undefined;
  const code = "code" in error ? error.code : undefined;

  if (status === 401 || status === 403) {
    return new RepositoryError(message, "PERMISSION_DENIED");
  }
  if (status === 404 || code === "PGRST116") {
    return new RepositoryError(message, "NOT_FOUND");
  }
  if (status === 422 || status === 400 || code === "23514" || code === "23505") {
    return new RepositoryError(message, "VALIDATION_ERROR");
  }
  if (status === 429) {
    return new RepositoryError("Supabase rate limit reached. Please try again later.", "VALIDATION_ERROR");
  }

  return new RepositoryError(message, "SERVER_ERROR");
}

export function throwIfSupabaseError(error: AuthError | PostgrestError | Error | null | undefined): asserts error is null | undefined {
  if (error) {
    throw mapSupabaseError(error);
  }
}
