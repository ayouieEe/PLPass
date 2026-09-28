import { describe, expect, it } from "vitest";
import { isStaleLazyChunkError } from "@/app/providers/AppErrorBoundary";

describe("AppErrorBoundary stale chunk recovery", () => {
  it("recognizes Vite lazy-chunk replacement errors", () => {
    expect(isStaleLazyChunkError(new Error("Failed to fetch dynamically imported module: plpass://app/assets/EventRecordsPage-old.js"))).toBe(true);
    expect(isStaleLazyChunkError(new Error("Loading chunk 12 failed."))).toBe(true);
  });

  it("does not reload for ordinary application errors", () => {
    expect(isStaleLazyChunkError(new Error("Student number is required."))).toBe(false);
  });
});
