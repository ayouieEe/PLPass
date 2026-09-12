import { describe, expect, it, vi } from "vitest";
import { createDebouncedQueryInvalidator } from "@/lib/async/createDebouncedQueryInvalidator";

describe("debounced query invalidator", () => {
  it("combines duplicate invalidations without dropping the eventual refresh", () => {
    vi.useFakeTimers();
    const invalidate = vi.fn();
    const scheduler = createDebouncedQueryInvalidator(invalidate, 250);

    scheduler.schedule(["attendanceRecords"]);
    scheduler.schedule(["attendanceRecords"]);
    scheduler.schedule(["attendanceRecords"]);
    vi.advanceTimersByTime(249);
    expect(invalidate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith(["attendanceRecords"]);
    vi.useRealTimers();
  });

  it("cancels a scheduled refresh during cleanup", () => {
    vi.useFakeTimers();
    const invalidate = vi.fn();
    const scheduler = createDebouncedQueryInvalidator(invalidate, 250);

    scheduler.schedule(["events"]);
    scheduler.clear();
    vi.runAllTimers();
    expect(invalidate).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
