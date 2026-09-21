import { describe, expect, it, vi } from "vitest";
import { AuthWeakPasswordError } from "@supabase/auth-js";
import { authFailure, authTimeoutFailure, isInvalidCredentialAuthError, SupabaseAuthResolutionError, toSafeAuthErrorMessage } from "@/app/providers/supabaseSessionResolver";

const authMocks = vi.hoisted(() => ({
  persistent: {
    auth: {
      setSession: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null })
    }
  },
  reauthentication: {
    auth: {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { session: { access_token: "access", refresh_token: "refresh" } }, error: null })
    }
  }
}));

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => authMocks.persistent,
  getSupabaseConfig: () => ({ url: "https://example.supabase.co", anonKey: "publishable-key" })
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => authMocks.reauthentication
}));

import { changePassword, forgotPasswordErrorMessage, newPasswordSchema, passwordChangeErrorMessage, passwordResetErrorMessage, passwordSchema } from "@/lib/auth/passwords";

describe("password management safeguards", () => {
  it("reauthenticates without racing the persistent application session", async () => {
    await changePassword("user@example.com", "Current-password1!", "New-password1!");

    expect(authMocks.reauthentication.auth.signInWithPassword).toHaveBeenCalledWith({ email: "user@example.com", password: "Current-password1!" });
    expect(authMocks.persistent.auth.setSession).toHaveBeenCalledWith({ access_token: "access", refresh_token: "refresh" });
    expect(authMocks.persistent.auth.updateUser).toHaveBeenCalledWith({ password: "New-password1!", current_password: "Current-password1!" });
    expect(authMocks.persistent.auth.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("requires a current password and a confirmed new password for voluntary changes", () => {
    expect(passwordSchema.safeParse({ currentPassword: "old-password", password: "New-password1!", confirmPassword: "New-password1!" }).success).toBe(true);
    expect(passwordSchema.safeParse({ currentPassword: "Same-password1!", password: "Same-password1!", confirmPassword: "Same-password1!" }).error?.issues[0]?.message).toMatch(/different/i);
    expect(passwordSchema.safeParse({ currentPassword: "old-password", password: "New-password1!", confirmPassword: "Different-password1!" }).error?.issues[0]?.message).toMatch(/match/i);
  });

  it("validates a recovery password without requiring the old password", () => {
    expect(newPasswordSchema.safeParse({ password: "New-password1!", confirmPassword: "New-password1!" }).success).toBe(true);
    expect(newPasswordSchema.safeParse({ password: "short", confirmPassword: "short" }).error?.issues[0]?.message).toMatch(/at least 8/i);
    expect(newPasswordSchema.safeParse({ password: "LongEnough1", confirmPassword: "LongEnough1" }).error?.issues[0]?.message).toMatch(/symbol/i);
  });

  it("does not expose authentication provider errors on the login page", () => {
    expect(toSafeAuthErrorMessage(authFailure())).toBe("We couldn't sign you in with those details. Check your email and password, then try again.");
    expect(toSafeAuthErrorMessage(authTimeoutFailure())).toBe("Sign-in is taking longer than expected. Check your internet connection and try again.");
    expect(toSafeAuthErrorMessage(new SupabaseAuthResolutionError("ACCOUNT_INACTIVE", "This PLPass account is suspended. Contact PLPass support if you believe this is a mistake.", true))).toBe("This PLPass account is suspended. Contact PLPass support if you believe this is a mistake.");
    expect(toSafeAuthErrorMessage(new SupabaseAuthResolutionError("UNSUPPORTED_ROLE", "internal role error", true))).toBe("This account role is not available in PLPass yet. Contact PLPass support for help.");
    expect(toSafeAuthErrorMessage(new SupabaseAuthResolutionError("DATABASE_QUERY_FAILED", "database password leaked", false))).toBe("PLPass sign-in is temporarily unavailable. Please try again later.");
    expect(toSafeAuthErrorMessage(new Error("Supabase configuration is missing"))).toBe("PLPass sign-in is temporarily unavailable. Please try again later or contact PLPass support.");
    expect(forgotPasswordErrorMessage(new Error("Supabase configuration is missing"))).toBe("Password reset is temporarily unavailable. Please try again later or contact PLPass support.");
    expect(forgotPasswordErrorMessage(new Error("network timeout"))).toBe("We couldn't send a reset link right now. Check your internet connection and try again.");
    expect(passwordChangeErrorMessage(new Error("Invalid login credentials"))).toBe("Your current password is incorrect.");
    expect(passwordResetErrorMessage(new Error("Auth session missing"))).toMatch(/expired/i);
    expect(passwordResetErrorMessage(new Error("Password is known to be weak"))).toMatch(/stronger/i);
    expect(passwordResetErrorMessage(new Error("Password should be at least 6 characters"))).toMatch(/security requirements/i);
    expect(passwordResetErrorMessage(new Error("Unexpected password update failure"))).toMatch(/^Unable to reset/i);
    expect(passwordResetErrorMessage(new AuthWeakPasswordError("weak", 400, ["characters"]))).toMatch(/character type required/i);
    expect(passwordResetErrorMessage(new AuthWeakPasswordError("weak", 400, ["length"]))).toMatch(/minimum set in Supabase/i);
    expect(passwordResetErrorMessage(new AuthWeakPasswordError("weak", 400, ["pwned"]))).toMatch(/known data breach/i);
  });

  it("distinguishes transport failures from invalid credentials", () => {
    expect(isInvalidCredentialAuthError(new Error("Invalid login credentials"))).toBe(true);
    expect(isInvalidCredentialAuthError(new Error("Failed to fetch"))).toBe(false);
    expect(toSafeAuthErrorMessage(new Error("Failed to fetch"))).toBe("We couldn't connect to PLPass. Check your internet connection and try again.");
    expect(toSafeAuthErrorMessage(new Error("Email not confirmed"))).toBe("Please verify your email address before signing in.");
  });

  it("explains common password-change failures without exposing provider internals", () => {
    expect(passwordChangeErrorMessage(new Error("Password should be at least 8 characters"))).toMatch(/security requirements/i);
    expect(passwordChangeErrorMessage(new Error("Failed to fetch"))).toMatch(/internet connection/i);
    expect(passwordChangeErrorMessage(new Error("Auth session missing"))).toMatch(/sign in again/i);
    expect(passwordChangeErrorMessage({ code: "current_password_invalid", status: 400 })).toMatch(/current password is incorrect/i);
    expect(passwordChangeErrorMessage({ code: "reauthentication_needed", status: 400 })).toMatch(/sign in again/i);
    expect(passwordChangeErrorMessage(new Error("Email not confirmed"))).toMatch(/not confirmed/i);
    expect(passwordChangeErrorMessage(new Error("rate limit exceeded"))).toMatch(/wait a few minutes/i);
    expect(passwordChangeErrorMessage({ message: "Invalid login credentials", code: "invalid_credentials", status: 400 })).toBe("Your current password is incorrect.");
    expect(passwordChangeErrorMessage({ error: "email_not_confirmed", status: 400 })).toMatch(/not confirmed/i);
    expect(passwordChangeErrorMessage("Failed to fetch")).toMatch(/internet connection/i);
  });
});
