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
 * Validation schema for event creation and updates
 * Based on the Event domain type and CreateEventInput contract
 */
export const eventFormSchema = z
  .object({
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
    priorityLevel: z.enum(["Time-Sensitive", "Business-Critical", "Flexible"], {
      errorMap: () => ({ message: "Priority level must be Time-Sensitive, Business-Critical, or Flexible" })
    }),
    impactScore: z
      .number()
      .min(0, "Impact score must be at least 0")
      .max(10, "Impact score must not exceed 10")
      .nullable()
      .optional()
  })
  .refine((value) => timeToMinutes(value.endTime) > timeToMinutes(value.startTime), {
    path: ["endTime"],
    message: "End time must be after start time"
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
