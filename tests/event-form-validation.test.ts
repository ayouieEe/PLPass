import { describe, expect, it } from "vitest";
import { eventFormSchema } from "@/lib/validations/events";

describe("event form validation", () => {
  it("requires college office and pax count", () => {
    const result = eventFormSchema.safeParse({
      code: "EVT-2026-001",
      title: "Career Fair",
      category: "Assembly",
      institutionalCategory: "Academic or Training",
      participationStatus: "Mandatory",
      targetGroup: "University-wide",
      venue: "Gymnasium",
      date: "2026-09-15",
      startTime: "09:00",
      endTime: "12:00",
      description: "Annual fair",
      remarks: "Need signage",
      priorityLevel: "Flexible",
      impactScore: 5,
      fixedPriority: false,
      requestedBy: "Jane Doe",
      collegeOffice: "",
      numberOfPax: null,
      resourceTitle: "",
      resourceUrl: ""
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("collegeOffice"))).toBe(true);
    expect(result.error?.issues.some((issue) => issue.path.includes("numberOfPax"))).toBe(true);
  });

  it("requires a resource title when a resource link is provided and enforces HTTPS", () => {
    const missingTitle = eventFormSchema.safeParse({
      code: "EVT-2026-002",
      title: "Workshop",
      category: "Workshop",
      institutionalCategory: "Academic or Training",
      participationStatus: "Voluntary",
      targetGroup: "College or Department-wide",
      venue: "AVR 1",
      date: "2026-09-16",
      startTime: "10:00",
      endTime: "12:00",
      priorityLevel: "Business-Critical",
      impactScore: 3,
      fixedPriority: false,
      requestedBy: "Ana",
      collegeOffice: "College of IT",
      numberOfPax: 60,
      resourceTitle: "",
      resourceUrl: "https://example.com/guide"
    });

    expect(missingTitle.success).toBe(false);
    expect(missingTitle.error?.issues.some((issue) => issue.path.includes("resourceTitle"))).toBe(true);

    const insecureUrl = eventFormSchema.safeParse({
      code: "EVT-2026-003",
      title: "Seminar",
      category: "Seminar",
      institutionalCategory: "Accreditation Linked",
      participationStatus: "Mandatory",
      targetGroup: "College or Department-wide",
      venue: "Auditorium",
      date: "2026-09-17",
      startTime: "08:00",
      endTime: "10:00",
      priorityLevel: "Time-Sensitive",
      impactScore: 8,
      fixedPriority: false,
      requestedBy: "Ana",
      collegeOffice: "Office of Student Affairs",
      numberOfPax: 120,
      resourceTitle: "Reference note",
      resourceUrl: "http://example.com/guide"
    });

    expect(insecureUrl.success).toBe(false);
    expect(insecureUrl.error?.issues.some((issue) => issue.path.includes("resourceUrl"))).toBe(true);
  });
});
