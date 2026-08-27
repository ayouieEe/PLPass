import { describe, expect, it, vi } from "vitest";
import {
  authTimeoutFailure,
  resolveSupabaseSessionUser,
  shouldSignOutAfterAuthFailure,
  type SupabaseSessionReader,
  toSafeAuthErrorMessage
} from "@/app/providers/supabaseSessionResolver";
import { withRequestTimeout } from "@/lib/async/requestTimeout";

describe("bounded authentication and dashboard requests", () => {
  it("returns completed requests without waiting for the deadline", async () => {
    await expect(withRequestTimeout(Promise.resolve("ready"), 100, "Too slow")).resolves.toBe("ready");
  });

  it("rejects stalled requests with a recognizable timeout", async () => {
    vi.useFakeTimers();
    const request = withRequestTimeout(new Promise<string>(() => undefined), 12_000, "Sign-in took too long");
    const assertion = expect(request).rejects.toMatchObject({
      name: "RequestTimeoutError",
      code: "REQUEST_TIMEOUT",
      message: "Sign-in took too long"
    });

    await vi.advanceTimersByTimeAsync(12_000);
    await assertion;
    vi.useRealTimers();
  });

  it("clears a possibly authenticated session after an authentication timeout", () => {
    const failure = authTimeoutFailure();
    expect(shouldSignOutAfterAuthFailure(failure)).toBe(true);
    expect(toSafeAuthErrorMessage(failure)).toContain("[AUTH_TIMEOUT]");
  });

  it("starts profile and role lookups in parallel", async () => {
    const reader: SupabaseSessionReader = {
      readProfile: vi.fn().mockResolvedValue({
        data: { id: "user-1", role: "organizer", first_name: "Organizer", last_name: "One", account_status: "active" },
        error: null
      }),
      readStudentRecord: vi.fn().mockResolvedValue({ data: null, error: null }),
      readFacultyRecord: vi.fn().mockResolvedValue({ data: null, error: null }),
      readOrganizerRecord: vi.fn().mockResolvedValue({ data: { id: "organizer-1", profile_id: "user-1" }, error: null }),
      readDeanAssignments: vi.fn().mockResolvedValue({ data: [], error: null })
    };

    const session = await resolveSupabaseSessionUser(reader, { id: "user-1", email: "organizer@example.com" });

    expect(reader.readProfile).toHaveBeenCalledWith("user-1");
    expect(reader.readStudentRecord).toHaveBeenCalledWith("user-1");
    expect(reader.readOrganizerRecord).toHaveBeenCalledWith("user-1");
    expect(session).toMatchObject({ userId: "user-1", role: "organizer", displayName: "Organizer One" });
  });
});
