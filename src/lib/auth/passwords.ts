import { z } from "zod";
import { isAuthWeakPasswordError } from "@supabase/auth-js";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getSupabaseConfig } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

export const passwordRequirementsMessage = "Use at least 8 characters, including uppercase and lowercase letters, a number, and a symbol.";

const securePasswordSchema = z
  .string()
  .min(8, passwordRequirementsMessage)
  .regex(/[a-z]/, passwordRequirementsMessage)
  .regex(/[A-Z]/, passwordRequirementsMessage)
  .regex(/\d/, passwordRequirementsMessage)
  .regex(/[!@#$%^&*()_+\-=[\]{};'":|<>?,./`~\\]/, passwordRequirementsMessage);

export const newPasswordSchema = z
  .object({
    password: securePasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password.")
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Passwords must match.", path: ["confirmPassword"] });
    }
  });

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    password: securePasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your new password.")
  })
  .superRefine((value, context) => {
    if (value.password === value.currentPassword) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Your new password must be different from your current password.", path: ["password"] });
    }
    if (value.password !== value.confirmPassword) context.addIssue({ code: z.ZodIssueCode.custom, message: "Passwords must match.", path: ["confirmPassword"] });
  });

function authErrorText(error: unknown) {
  if (error instanceof Error) return error.message.toLowerCase();
  if (typeof error === "string") return error.toLowerCase();
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    return [value.message, value.error_description, value.error, value.code, value.status]
      .filter((part) => typeof part === "string" || typeof part === "number")
      .join(" ")
      .toLowerCase();
  }
  return String(error ?? "").toLowerCase();
}

export function passwordChangeErrorMessage(error: unknown) {
  const message = authErrorText(error);
  if (message.includes("invalid login credentials") || message.includes("invalid credentials") || message.includes("current_password_invalid") || message.includes("current password required")) {
    return "Your current password is incorrect.";
  }
  if (message.includes("failed to fetch") || message.includes("network") || message.includes("timeout")) {
    return "Unable to connect to PLPass. Check your internet connection and try again.";
  }
  if (message.includes("email not confirmed") || message.includes("email_not_confirmed")) {
    return "Your email address is not confirmed yet. Accept the invitation or contact an administrator before changing the password.";
  }
  if (message.includes("rate limit") || message.includes("too many requests") || message.includes("over_email_send_rate_limit")) {
    return "Too many password attempts were made. Wait a few minutes, then try again.";
  }
  if (message.includes("weak") || message.includes("leaked password") || message.includes("pwned")) {
    return "Choose a stronger password that you have not used elsewhere.";
  }
  if (message.includes("at least") || message.includes("too short") || message.includes("minimum length") || message.includes("character")) {
    return "Your new password does not meet PLPass security requirements.";
  }
  if (message.includes("same password") || message.includes("different from")) {
    return "Choose a password that is different from your current password.";
  }
  if (message.includes("reauthentication_needed") || message.includes("reauthentication required")) {
    return "Please sign in again, then retry the password change.";
  }
  if (message.includes("session") || message.includes("token") || message.includes("jwt")) {
    return "Your session has expired. Sign in again, then retry the password change.";
  }
  return "Unable to change your password right now. Please try again.";
}

export function forgotPasswordErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("configuration")) {
    return "Password reset is temporarily unavailable. Please try again later or contact PLPass support.";
  }
  return "We couldn't send a reset link right now. Check your internet connection and try again.";
}

export function passwordResetErrorMessage(error: unknown) {
  if (isAuthWeakPasswordError(error)) {
    if (error.reasons.includes("pwned")) {
      return "Choose a different password. This password has appeared in a known data breach.";
    }
    if (error.reasons.includes("length")) {
      return "Your password is shorter than the minimum set in Supabase. Use a longer password and try again.";
    }
    if (error.reasons.includes("characters")) {
      return "Your password is missing a character type required by Supabase. Include uppercase and lowercase letters, a number, and a symbol.";
    }
  }
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("session") || message.includes("token") || message.includes("jwt")) {
    return "This password reset link is invalid or has expired. Request a new one.";
  }
  if (message.includes("weak") || message.includes("leaked password") || message.includes("pwned")) {
    return "Choose a stronger password that you have not used elsewhere.";
  }
  if (message.includes("at least") || message.includes("too short") || message.includes("minimum length") || message.includes("character")) {
    return "Your password does not meet PLPass security requirements. Use a longer password with uppercase and lowercase letters, a number, and a symbol.";
  }
  if (message.includes("different from") || message.includes("same password")) {
    return "Choose a password that is different from your previous password.";
  }
  return "Unable to reset your password right now. Request a new reset link and try again.";
}

export async function changePassword(email: string, currentPassword: string, password: string) {
  const client = getSupabaseBrowserClient();
  const config = getSupabaseConfig();
  // Reauthenticate on an isolated client so SIGNED_IN events from the
  // verification step cannot race the app's persistent session resolver.
  const reauthenticationClient = createClient<Database>(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { data: signInData, error: signInError } = await reauthenticationClient.auth.signInWithPassword({
    email: email.trim(),
    password: currentPassword
  });
  if (signInError) throw signInError;
  if (!signInData.session) throw new Error("The reauthentication session could not be established.");

  // Make the verified session explicit on the persistent client before the
  // password update. This also repairs a stale access token without logging
  // the user out or creating another account.
  const { error: sessionError } = await client.auth.setSession({
    access_token: signInData.session.access_token,
    refresh_token: signInData.session.refresh_token
  });
  if (sessionError) throw sessionError;

  // PLPass Current requires the current password at the Auth API boundary.
  // Reauthentication above keeps the session fresh; this field satisfies the
  // server-side current-password policy without storing or logging the value.
  const { error: updateError } = await client.auth.updateUser({
    password,
    current_password: currentPassword
  });
  if (updateError) throw updateError;

  // Keep this browser signed in while ending sessions on other devices. Password
  // update success must not be reported as a failure if this optional cleanup is unavailable.
  try {
    await client.auth.signOut({ scope: "others" });
  } catch {
    // Current session remains valid after a successful password update.
  }
}
