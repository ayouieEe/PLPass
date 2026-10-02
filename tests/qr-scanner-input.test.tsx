import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QRFallbackPanel } from "@/features/attendance/QRFallbackPanel";

describe("hardware QR scanner input", () => {
  it("accepts a scanner sequence without a focused field or submit button", () => {
    const onScan = vi.fn();
    render(<QRFallbackPanel onScan={onScan} />);

    expect(screen.queryByRole("button", { name: /enable/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /record scan/i })).not.toBeInTheDocument();

    for (const key of "2026-001") {
      fireEvent.keyDown(window, { key });
    }
    fireEvent.keyDown(window, { key: "Enter" });

    expect(onScan).toHaveBeenCalledWith("2026-001");
    expect(screen.getByText(/last scanner value received: 2026-001/i)).toBeInTheDocument();
  });

  it("ignores slow ordinary typing while QR scanner capture is active", () => {
    const onScan = vi.fn();
    render(<QRFallbackPanel onScan={onScan} />);

    const now = vi.spyOn(performance, "now");
    let tick = 0;
    now.mockImplementation(() => {
      tick += 200;
      return tick;
    });
    for (const key of "2026-001") {
      fireEvent.keyDown(window, { key });
    }
    fireEvent.keyDown(window, { key: "Enter" });

    expect(onScan).not.toHaveBeenCalled();
    now.mockRestore();
  });
});
