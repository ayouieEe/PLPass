import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("linked Supabase session schema usage", () => {
  it("uses the linked database's event session schema in the live repository path", () => {
    const repository = read("src/services/supabase/repositories.ts");
    const provider = read("src/app/providers/DevelopmentSessionProvider.tsx");

    expect(repository).toContain('client.from("event_sessions").select("id")');
    expect(repository).toContain('builder.in("event_session_id", sessionIds)');
    expect(repository).not.toContain('client.from("attendance_sessions")');
    expect(provider).toContain("event_sessions:");
    expect(provider).not.toContain("attendance_sessions:");
  });

  it("reports the exact linked queries that fail in Request History", () => {
    const page = read("src/features/student/pages/RequestHistoryPage.tsx");

    expect(page).toContain("unavailableLinkedDetails");
    expect(page).toContain("Unavailable right now:");
    expect(page).toContain('classesQuery.isError ? "class details"');
    expect(page).toContain('recordsQuery.isError ? "attendance records"');
  });
});
