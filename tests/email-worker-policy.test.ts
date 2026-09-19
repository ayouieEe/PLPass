import { describe, expect, it } from "vitest";
import {
  buildBrevoPayload,
  isBrevoQuotaResponse,
  nonNegativeIntegerSetting,
  positiveIntegerSetting
} from "../supabase/functions/_shared/emailWorkerPolicy";

describe("email worker policy", () => {
  it("preserves an explicit zero daily cap and safely falls back for invalid values", () => {
    expect(nonNegativeIntegerSetting("0", 250)).toBe(0);
    expect(nonNegativeIntegerSetting("250.9", 100)).toBe(250);
    expect(nonNegativeIntegerSetting("invalid", 250)).toBe(250);
    expect(positiveIntegerSetting("0", 60)).toBe(1);
  });

  it("recognizes only provider quota and rate-limit responses as deferrable", () => {
    expect(isBrevoQuotaResponse(429, "Too many requests")).toBe(true);
    expect(isBrevoQuotaResponse(400, "Daily limit reached")).toBe(true);
    expect(isBrevoQuotaResponse(403, "Invalid API key")).toBe(false);
    expect(isBrevoQuotaResponse(500, "Provider unavailable")).toBe(false);
  });

  it("places Brevo sandbox mode inside the JSON payload headers", () => {
    const payload = buildBrevoPayload(
      { recipient_email: "developer@example.test", subject: "Test", body: "Body" },
      "noreply@example.test",
      "PLPass",
      true
    );
    expect(payload.headers).toEqual({ "X-Sib-Sandbox": "drop" });
    expect(buildBrevoPayload({ recipient_email: "developer@example.test", subject: "Test", body: "Body" }, "noreply@example.test", "PLPass", false).headers).toBeUndefined();
  });
});
