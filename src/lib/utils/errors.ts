export class AppError extends Error {
  constructor(
    message: string,
    public readonly code = "APP_ERROR"
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Extracts raw error text from any error object, string, or unknown value.
 */
function extractRawErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (typeof error === "object") {
    const errObj = error as Record<string, unknown>;
    if (typeof errObj.message === "string") return errObj.message;
    if (typeof errObj.error === "string") return errObj.error;
    if (typeof errObj.details === "string") return errObj.details;
  }
  return null;
}

/**
 * Translates technical error messages, database codes, network failures,
 * and system jargon into clean, user-friendly language.
 */
export function formatUserErrorMessage(rawMessage: string | null | undefined): string {
  if (!rawMessage || !rawMessage.trim()) {
    return "An unexpected issue occurred. Please try again.";
  }

  let msg = rawMessage.trim();
  const lower = msg.toLowerCase();

  // Strip technical log or error prefixes if present
  if (lower.startsWith("failed to log client action:")) {
    msg = msg.substring("failed to log client action:".length).trim();
    return formatUserErrorMessage(msg);
  }
  if (lower.startsWith("unhandled error:")) {
    msg = msg.substring("unhandled error:".length).trim();
    return formatUserErrorMessage(msg);
  }

  // Network & Connection Issues
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network error") ||
    lower.includes("net::err_") ||
    lower.includes("econnrefused") ||
    lower.includes("socket hang up")
  ) {
    return "Unable to connect to the server. Please check your internet connection and try again.";
  }

  // Request Timeout / Deadline
  if (
    lower.includes("took too long") ||
    lower.includes("requesttimeout") ||
    lower.includes("timeout") ||
    lower.includes("deadline exceeded")
  ) {
    return "The request took longer than expected to complete. Please check your network connection and try again.";
  }

  // Supabase / Postgrest Schema Cache & Migration Issues
  if (
    lower.includes("pgrst202") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the function") ||
    (lower.includes("relation") && lower.includes("does not exist")) ||
    (lower.includes("column") && lower.includes("does not exist"))
  ) {
    return "The system is currently updating. Please refresh the page or try again in a few moments.";
  }

  // Duplicate Records / Unique Constraint Violations (Postgres code 23505)
  if (
    lower.includes("23505") ||
    lower.includes("duplicate key") ||
    lower.includes("already exists") ||
    lower.includes("unique constraint")
  ) {
    return "This record or request already exists. Please check your entries and try again.";
  }

  // Foreign Key Constraint Violations (Postgres code 23503)
  if (
    lower.includes("23503") ||
    lower.includes("foreign key constraint") ||
    lower.includes("violates foreign key")
  ) {
    return "The selected item or record could not be found or is no longer available.";
  }

  // Check Constraint Violations (Postgres code 23514)
  if (
    lower.includes("23514") ||
    lower.includes("check constraint") ||
    lower.includes("violates check constraint")
  ) {
    return "The information provided does not meet requirement criteria. Please check your inputs.";
  }

  // RLS / Security / Permission Denied (Postgres code 42501)
  if (
    lower.includes("42501") ||
    lower.includes("permission denied") ||
    lower.includes("row-level security") ||
    lower.includes("rls")
  ) {
    return "You do not have permission to perform this action. If you believe this is an error, please sign in again or contact support.";
  }

  // Auth / Session Expiration
  if (
    lower.includes("jwt expired") ||
    lower.includes("invalid claim") ||
    lower.includes("invalid_grant") ||
    lower.includes("invalid refresh token") ||
    lower.includes("session not found") ||
    lower.includes("no authenticated supabase session")
  ) {
    return "Your session has expired or is invalid. Please sign in again.";
  }

  // Invalid Login Credentials
  if (lower.includes("invalid login credentials") || lower.includes("invalid credentials")) {
    return "Incorrect email address or password. Please try again.";
  }

  // Invalid Data Format / Invalid UUID
  if (
    lower.includes("invalid input syntax for type uuid") ||
    lower.includes("invalid input syntax") ||
    (lower.includes("uuid") && lower.includes("invalid"))
  ) {
    return "One or more ID entries are improperly formatted. Please check your selections.";
  }

  // Missing Record / Postgrest 116 / 404
  if (
    lower.includes("pgrst116") ||
    lower.includes("json object requested, multiple (or no) rows returned") ||
    lower.includes("row was not found")
  ) {
    return "The requested record could not be found.";
  }

  // Rate Limiting
  if (lower.includes("429") || lower.includes("rate limit")) {
    return "Too many requests submitted. Please wait a moment before trying again.";
  }

  // JavaScript / Runtime Exception Jargon
  if (
    lower.includes("cannot read property") ||
    lower.includes("cannot read properties of undefined") ||
    lower.includes("cannot read properties of null") ||
    lower.includes("is not a function") ||
    lower.includes("unexpected token") ||
    lower.includes("unhandled runtime error")
  ) {
    return "An unexpected display issue occurred. Please refresh the page.";
  }

  // Raw DB queries or SQL internal identifiers
  if (msg.includes("`") || msg.includes("pkey") || msg.includes("_tbl") || msg.includes("public.")) {
    return "Unable to complete this request due to a database validation error. Please check your inputs.";
  }

  // If the message is already clean, readable user text, return it directly
  return msg;
}

export function getErrorMessage(error: unknown): string {
  const raw = extractRawErrorMessage(error);
  return formatUserErrorMessage(raw);
}
