import { describe, expect, it } from "vitest";

import {
  isMissingRescheduleSchemaColumnError,
  isNonBlockingAuditLoggingError
} from "@/services/supabase/repositories";

describe("reschedule compatibility guards", () => {
  it("detects missing reschedule columns in Supabase schema errors", () => {
    const error = new Error("Could not find the 'rescheduled_at' column of 'event_sessions' in the schema cache");

    expect(isMissingRescheduleSchemaColumnError(error)).toBe(true);
  });

  it("detects audit log permission errors that should not block the reschedule", () => {
    const error = new Error("permission denied for table audit_logs");

    expect(isNonBlockingAuditLoggingError(error)).toBe(true);
  });

  it("detects plain object Supabase errors too", () => {
    const error = {
      message: "permission denied for table audit_logs"
    };

    expect(isNonBlockingAuditLoggingError(error)).toBe(true);
  });

  it("ignores unrelated database errors", () => {
    const error = new Error("permission denied for table event_sessions");

    expect(isMissingRescheduleSchemaColumnError(error)).toBe(false);
    expect(isNonBlockingAuditLoggingError(error)).toBe(false);
  });
});
