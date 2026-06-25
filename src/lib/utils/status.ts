export type UiStatus = "idle" | "loading" | "empty" | "success" | "error";

export function isTerminalStatus(status: UiStatus) {
  return status === "empty" || status === "success" || status === "error";
}
