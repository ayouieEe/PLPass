import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVisibleInterval, createVisibleTabLease } from "@/lib/browser/visibilityControls";

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("visibility controls", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    setVisibility("visible");
  });

  afterEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("does not poll while hidden and refreshes immediately when visible again", () => {
    const callback = vi.fn();
    const dispose = createVisibleInterval(callback, 60_000);
    vi.advanceTimersByTime(60_000);
    expect(callback).toHaveBeenCalledTimes(1);

    setVisibility("hidden");
    vi.advanceTimersByTime(120_000);
    expect(callback).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    expect(callback).toHaveBeenCalledTimes(2);
    dispose();
  });

  it("confirms one visible tab as leader before enabling side effects", () => {
    const firstLeadership = vi.fn();
    const secondLeadership = vi.fn();
    const first = createVisibleTabLease("test-unstarted-events", firstLeadership);
    const second = createVisibleTabLease("test-unstarted-events", secondLeadership);

    expect(first.isLeader()).toBe(false);
    expect(second.isLeader()).toBe(false);
    vi.advanceTimersByTime(25);

    expect(first.isLeader()).toBe(true);
    expect(second.isLeader()).toBe(false);
    expect(firstLeadership).toHaveBeenCalledWith(true);
    expect(secondLeadership).not.toHaveBeenCalledWith(true);

    first.dispose();
    second.dispose();
  });
});
