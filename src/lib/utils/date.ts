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
  return date ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date) : fallback;
}

export function formatDisplayTime(value: DateInput, fallback = "Not set") {
  const date = toValidDate(value);
  return date ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Manila" }).format(date) : fallback;
}

export function to24HourTime(value: string | null | undefined) {
  if (!value) return "";
  const trimmed = value.trim();
  if (!trimmed) return "";

  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    const hours = Number(ampmMatch[1]);
    const minutes = Number(ampmMatch[2]);
    const meridiem = ampmMatch[3].toUpperCase();
    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
      return trimmed;
    }
    const normalizedHours = meridiem === "PM" ? (hours % 12) + 12 : hours % 12;
    return `${String(normalizedHours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  return trimmed;
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
  return date ? date.toISOString().slice(0, 10) : "";
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
