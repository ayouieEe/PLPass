const defaultDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short"
});

export function formatDateTime(value: Date | string) {
  return defaultDateTimeFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}
