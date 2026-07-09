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
  return date ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit" }).format(date) : fallback;
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
