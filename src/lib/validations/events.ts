import { z } from "zod";

/**
 * Helper to convert time string (HH:MM) to minutes for comparison
 */
function timeToMinutes(value: string): number {
  const [hoursPart = "0", minutesPart = "0"] = value.split(":");
  const hours = Number(hoursPart);
  const minutes = Number(minutesPart);
  return (Number.isNaN(hours) ? 0 : hours) * 60 + (Number.isNaN(minutes) ? 0 : minutes);
}

/**
 * Helper to check if date is today or in the future
 */
function isTodayOrFuture(dateString: string): boolean {
  if (!dateString) return false;
  const eventDate = new Date(`${dateString}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return eventDate >= today;
}

/**
 * Validation schema for event creation and updates
 * Based on the Event domain type and CreateEventInput contract
 */
export const eventBaseSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Event code is required")
    .min(2, "Event code must be at least 2 characters"),
  title: z
    .string()
    .trim()
    .min(1, "Event title is required")
    .min(3, "Event title must be at least 3 characters")
    .max(255, "Event title must not exceed 255 characters"),
  category: z.string().trim().min(1, "Category is required"),
  institutionalCategory: z.enum(["Accreditation Linked", "Academic or Training", "Social or Recreational"]),
  participationStatus: z.enum(["Mandatory", "Voluntary"]),
  targetGroup: z.enum(["University-wide", "College or Department-wide", "Single Class or Organization"]),
  venue: z
    .string()
    .trim()
    .min(1, "Venue is required")
    .min(2, "Venue must be at least 2 characters"),
  date: z.string().min(1, "Event date is required"),
  startTime: z.string().min(1, "Start time is required"),
  endTime: z.string().min(1, "End time is required"),
  description: z
    .string()
    .trim()
    .optional()
    .refine((val) => !val || val.length >= 3, {
      message: "Description must be at least 3 characters if provided"
    })
    .refine((val) => !val || val.length <= 1000, {
      message: "Description must not exceed 1000 characters"
    }),
  remarks: z
    .string()
    .trim()
    .optional()
    .refine((val) => !val || val.length >= 3, {
      message: "Remarks must be at least 3 characters if provided"
    })
    .refine((val) => !val || val.length <= 1000, {
      message: "Remarks must not exceed 1000 characters"
    }),
  priorityLevel: z.enum(["Time-Sensitive", "Business-Critical", "Flexible"], {
    errorMap: () => ({ message: "Priority level must be Time-Sensitive, Business-Critical, or Flexible" })
  }),
  impactScore: z
    .number()
    .min(0, "Impact score must be at least 0")
    .max(10, "Impact score must not exceed 10")
    .nullable()
    .optional(),
  fixedPriority: z.boolean().default(false),
  requestedBy: z.string().trim().min(2, "Requested by must be at least 2 characters").max(255).optional(),
  collegeOffice: z.string().trim().min(2, "College/Office is required.").max(255),
  numberOfPax: z.number().int("No. of Pax must be a whole number").min(1, "No. of Pax is required."),
  resourceTitle: z.string().trim().max(255).optional(),
  resourceUrl: z.string().trim().refine((value) => !value || /^https:\/\//.test(value), "Resource link must use HTTPS.").optional()
});

export const eventFormSchema = eventBaseSchema
  .superRefine((value, ctx) => {
    const resourceUrl = value.resourceUrl?.trim();
    const resourceTitle = value.resourceTitle?.trim();

    if (resourceUrl && !resourceTitle) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resourceTitle"],
        message: "Resource title is required when a resource link is provided."
      });
    }
  })
  .refine((value) => timeToMinutes(value.endTime) > timeToMinutes(value.startTime), {
    path: ["endTime"],
    message: "End time must be after start time"
  })
  .refine((value) => isTodayOrFuture(value.date), {
    path: ["date"],
    message: "Event date must be today or in the future"
  });

/**
 * Schema for filtering and querying events
 */
export const eventFilterSchema = z.object({
  search: z.string().trim().optional(),
  status: z
    .enum(["draft", "scheduled", "ongoing", "completed", "cancelled", "approved", "pending", "declined"])
    .optional(),
  priorityLevel: z.enum(["Time-Sensitive", "Business-Critical", "Flexible"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  sortBy: z.enum(["date", "priority", "name"]).optional(),
  sortDirection: z.enum(["asc", "desc"]).optional()
});

/**
 * Schema for validating event session start/end
 */
export const eventSessionSchema = z
  .object({
    venue: z.string().trim().min(1, "Venue is required"),
    date: z.string().min(1, "Date is required"),
    startTime: z.string().min(1, "Start time is required"),
    expectedEndTime: z.string().min(1, "Expected end time is required"),
    attendanceMode: z.enum(["face-to-face", "online"])
  })
  .refine((value) => timeToMinutes(value.expectedEndTime) > timeToMinutes(value.startTime), {
    path: ["expectedEndTime"],
    message: "Expected end time must be after start time"
  });

export type EventFormSchema = z.infer<typeof eventFormSchema>;
export type EventFilterSchema = z.infer<typeof eventFilterSchema>;
export type EventSessionSchema = z.infer<typeof eventSessionSchema>;
