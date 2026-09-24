const defaultDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short"
});

export type DateInput = Date | string | number | null | undefined;

export function toValidDate(value: DateInput) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = /^\d{2}:\d{2}(:\d{2})?$/.test(trimmed) ? `1970-01-01T${trimmed}` : trimmed;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: DateInput, fallback = "N/A") {
  const date = toValidDate(value);
  return date ? defaultDateTimeFormatter.format(date) : fallback;
}

export function formatDisplayDate(value: DateInput, fallback = "Not scheduled") {
  const date = toValidDate(value);
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(date) : fallback;
}

export function formatDisplayTime(value: DateInput, fallback = "Not set") {
  const date = toValidDate(value);
  return date ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" }).format(date) : fallback;
}

/** Use the organizer computer's clock for timestamps captured during a live session. */
export function formatLocalTime(value: DateInput, fallback = "Not set") {
  const date = toValidDate(value);
  return date ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(date) : fallback;
}

export function getPhilippineNowIso() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(now).reduce<Record<string, string>>((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});

  const philippineDateTime = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  return new Date(`${philippineDateTime}+08:00`).toISOString();
}

export function dateKey(value: DateInput) {
  const date = toValidDate(value);
  if (!date) return "";

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((accumulator, part) => {
    if (part.type !== "literal") {
      accumulator[part.type] = part.value;
    }
    return accumulator;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Convert a Manila wall-clock date/time into an unambiguous UTC timestamp. */
export function manilaDateTimeToIso(date: string, time: string) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dateMatch || !timeMatch) {
    throw new Error("A valid Manila date and time are required.");
  }
  const [, hour, minute] = timeMatch;
  if (Number(hour) > 23 || Number(minute) > 59) throw new Error("The Manila date and time are invalid.");
  const parsed = new Date(`${date}T${time}:00+08:00`);
  // The ISO string is UTC, so its calendar date is the previous day for
  // valid Manila times before 08:00. Validate against the intended wall-clock
  // timezone instead of comparing the UTC date portion.
  if (Number.isNaN(parsed.getTime()) || dateKey(parsed) !== date) {
    throw new Error("The Manila date and time are invalid.");
  }
  return parsed.toISOString();
}

export function compareDateValues(first: DateInput, second: DateInput) {
  const firstTime = toValidDate(first)?.getTime() ?? Number.POSITIVE_INFINITY;
  const secondTime = toValidDate(second)?.getTime() ?? Number.POSITIVE_INFINITY;
  return firstTime - secondTime;
}

export function isFutureOrNowDate(value: DateInput) {
  const date = toValidDate(value);
  return Boolean(date && date >= new Date());
}

export function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
