import { describe, expect, it } from "vitest";
import { formatUserErrorMessage } from "@/lib/utils/errors";

describe("database migration error formatting", () => {
  it("does not expose a missing attendance-origin column to organizers", () => {
    expect(formatUserErrorMessage("column attendance_records.attendance_origin does not exist"))
      .toBe("The system is currently updating. Please refresh the page or try again in a few moments.");
  });

  it("removes Electron IPC details from local attendance errors", () => {
    expect(formatUserErrorMessage("Error invoking remote method 'offline:recordScanner': Error: Time Out can be recorded at least one minute after Time In."))
      .toBe("Please wait at least one minute after Time In before recording Time Out.");
  });

  it("turns wrapped transport failures into a clear retry message", () => {
    expect(formatUserErrorMessage("Error invoking remote method 'offline:recordScanner': Error: Failed to fetch"))
      .toBe("Unable to connect to the server. Please check your internet connection and try again.");
  });
});
