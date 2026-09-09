import { z } from "zod";
import { isAuthWeakPasswordError } from "@supabase/auth-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

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

export function passwordChangeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid login credentials") || message.includes("invalid credentials")) {
    return "Your current password is incorrect.";
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
  const { error: signInError } = await client.auth.signInWithPassword({ email, password: currentPassword });
  if (signInError) throw signInError;

  const { error: updateError } = await client.auth.updateUser({ password });
  if (updateError) throw updateError;

  // Keep this browser signed in while ending sessions on other devices. Password
  // update success must not be reported as a failure if this optional cleanup is unavailable.
  try {
    await client.auth.signOut({ scope: "others" });
  } catch {
    // Current session remains valid after a successful password update.
  }
}
