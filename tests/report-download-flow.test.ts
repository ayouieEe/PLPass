import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { triggerDownload } from "@/features/organizer/utils/exportUtils";

describe("report download flow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    if (!("createObjectURL" in URL)) {
      Object.defineProperty(URL, "createObjectURL", { value: vi.fn(() => "blob:test-url"), writable: true, configurable: true });
    }
    if (!("revokeObjectURL" in URL)) {
      Object.defineProperty(URL, "revokeObjectURL", { value: vi.fn(), writable: true, configurable: true });
    }
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("keeps the generated download URL alive long enough for the browser to save the file", () => {
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const appendSpy = vi.spyOn(document.body, "appendChild");
    const removeSpy = vi.spyOn(document.body, "removeChild");

    const url = triggerDownload(new Blob(["report"], { type: "application/pdf" }), "event-summary.pdf");

    expect(typeof url).toBe("string");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(appendSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalledTimes(1);
    expect(revokeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);
    expect(revokeSpy).toHaveBeenCalledWith(url);
  });
});
