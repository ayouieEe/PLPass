import { describe, expect, it } from "vitest";
import { eventResourceDownloadFileName } from "@/features/organizer/lib/eventResources";
import type { EventResource } from "@/types/domain";

const fileResource = (overrides: Partial<EventResource> = {}): EventResource => ({
  id: "resource-1",
  eventId: "event-1",
  title: "Testing File",
  storageBucket: "event-resources",
  storageObjectPath: "event-1/uuid-Testing-File.pdf",
  ...overrides
});

describe("event resource downloads", () => {
  it("preserves the uploaded file extension when a custom title has none", () => {
    expect(eventResourceDownloadFileName(fileResource())).toBe("Testing-File.pdf");
  });

  it("does not duplicate an extension already present in the title", () => {
    expect(eventResourceDownloadFileName(fileResource({ title: "Agenda.PDF" }))).toBe("Agenda.pdf");
  });

  it("falls back to the response content type when storage metadata has no extension", () => {
    expect(eventResourceDownloadFileName(fileResource({ storageObjectPath: "event-1/uuid" }), "text/plain")).toBe("Testing-File.txt");
  });

  it("sanitizes unsafe title characters", () => {
    expect(eventResourceDownloadFileName(fileResource({ title: "Budget / secrets?.xlsx" }))).toBe("Budget-secrets.xlsx");
  });
});
