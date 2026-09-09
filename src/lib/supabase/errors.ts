import type { AuthError, PostgrestError } from "@supabase/supabase-js";
import { RepositoryError } from "@/services/repositoryUtils";
import { formatUserErrorMessage } from "@/lib/utils/errors";

export function mapSupabaseError(error: AuthError | PostgrestError | Error | null | undefined): RepositoryError {
  if (!error) {
    return new RepositoryError("An unexpected server issue occurred. Please try again.", "SERVER_ERROR");
  }

  const rawMessage = error.message || "An unexpected server issue occurred. Please try again.";
  const friendlyMessage = formatUserErrorMessage(rawMessage);
  const status = "status" in error ? error.status : undefined;
  const code = "code" in error ? error.code : undefined;

  if (code === "PGRST202" || /schema cache|could not find the function/i.test(rawMessage)) {
    return new RepositoryError(
      "The system is currently updating. Please refresh the page or try again in a few moments.",
      "SERVER_ERROR"
    );
  }

  if (status === 401 || status === 403) {
    return new RepositoryError(friendlyMessage, "PERMISSION_DENIED");
  }
  if (status === 404 || code === "PGRST116") {
    return new RepositoryError(friendlyMessage, "NOT_FOUND");
  }
  if (status === 422 || status === 400 || code === "23514" || code === "23505") {
    return new RepositoryError(friendlyMessage, "VALIDATION_ERROR");
  }
  if (status === 429) {
    return new RepositoryError("Too many requests submitted. Please wait a moment before trying again.", "VALIDATION_ERROR");
  }

  return new RepositoryError(friendlyMessage, "SERVER_ERROR");
}

export function throwIfSupabaseError(error: AuthError | PostgrestError | Error | null | undefined): asserts error is null | undefined {
  if (error) {
    throw mapSupabaseError(error);
  }
}
