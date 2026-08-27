import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ErrorState } from "@/components/feedback/ErrorState";
import { LoadingState } from "@/components/feedback/LoadingState";
import { SubmitButton } from "@/components/forms/SubmitButton";

describe("accessible asynchronous feedback", () => {
  it("announces loading state as busy status", () => {
    render(<LoadingState label="Loading attendance records" />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
  });

  it("announces failures assertively", () => {
    render(<ErrorState title="Unable to save" message="Try again." />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveTextContent("Unable to save");
  });

  it("disables duplicate submission and exposes its busy label", () => {
    render(<SubmitButton isSubmitting submittingLabel="Publishing Event…">Publish Event</SubmitButton>);
    const button = screen.getByRole("button", { name: "Publishing Event…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});
