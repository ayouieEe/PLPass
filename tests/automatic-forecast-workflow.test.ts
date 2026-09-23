import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("automatic turnout forecast workflow", () => {
  it("backfills only missing non-cancelled forecasts and persists them", () => {
    const hook = source("src/features/organizer/hooks/useAutomaticForecasts.ts");

    expect(hook).toContain('event.predictedTurnout == null');
    expect(hook).toContain('event.status !== "cancelled"');
    expect(hook).toContain('event.status !== "rejected"');
    expect(hook).toContain("saveEventForecast(event.id, percentage, context)");
    expect(hook).toContain('invalidateQueries({ queryKey: ["events"] })');
    expect(hook).toContain('window.addEventListener("online", retry)');
    expect(hook).toContain('window.addEventListener("focus", retry)');
    expect(hook).toContain("inFlightEventIds.current.delete(event.id)");
  });

  it("runs automatically on both organizer surfaces", () => {
    expect(source("src/features/organizer/pages/OrganizerDashboardPage.tsx")).toContain("useAutomaticForecasts(");
    expect(source("src/features/organizer/pages/OrganizerAnalyticsPage.tsx")).toContain("useAutomaticForecasts(");
  });

  it("uses the signed-in organizer token for ML data reads", () => {
    const client = source("src/services/api/mlClient.ts");
    const api = source("api/main.py");
    const supabase = source("api/services/supabase_client.py");

    expect(client).toContain("Authorization: `Bearer ${accessToken}`");
    expect(api).toContain("An authenticated organizer session is required.");
    expect(api).toContain("get_event_features(req.event_id, access_token)");
    expect(supabase).toContain("client.postgrest.auth(access_token)");
    expect(supabase).not.toContain('SUPABASE_SERVICE_KEY');
  });

  it("uses the same IPv4 loopback endpoint Electron starts", () => {
    const client = source("src/services/api/mlClient.ts");
    const electron = source("electron/main.ts");

    expect(client).toContain('"http://127.0.0.1:8000"');
    expect(electron).toContain('"--host", "127.0.0.1", "--port", "8000"');
  });

  it("creates a missing local prediction artifact without blocking startup on facial loading", () => {
    const api = source("api/main.py");

    expect(api).toContain("train_and_write_artifacts(write_insights=False)");
    expect(api).toContain("asyncio.create_task(warm_facial_model_in_background())");
    expect(api).not.toContain("from api.services.facial_recognition import FacialRecognitionError");
  });
});
