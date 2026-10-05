import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20261004090000_guard_event_code_and_participant_schedule.sql", "utf8");
const createEventPage = readFileSync("src/features/organizer/pages/CreateEventPage.tsx", "utf8");
const eventDetailsPage = readFileSync("src/features/organizer/pages/EventDetailsPage.tsx", "utf8");

describe("event scheduling safeguards", () => {
  it("allocates event codes globally and serializes publish operations", () => {
    expect(migration).toContain("private.lock_event_publish_guard");
    expect(migration).toContain("private.allocate_event_code");
    expect(migration).toContain("select coalesce(max");
    expect(migration).toContain("create or replace function public.get_next_event_code");
    expect(migration).toContain("v_event_code := private.allocate_event_code");
  });

  it("guards creation, additions, and rescheduling against overlapping participants", () => {
    expect(migration).toContain("private.assert_event_participant_schedule_available");
    expect(migration).toContain("public.add_organizer_event_participants");
    expect(migration).toContain("e.id is distinct from p_event_id");
    expect(migration).toContain("e.starts_at < p_ends_at");
    expect(migration).toContain("e.ends_at > p_starts_at");
    expect(migration).toContain("drop policy if exists event_participants_insert_owner");
    expect(eventDetailsPage).toContain("addEventParticipants");
    expect(eventDetailsPage).toContain("findEventParticipantScheduleConflicts");
    expect(eventDetailsPage).toContain("participantPickerConflicts");
    expect(eventDetailsPage).toContain("disabled={Boolean(conflict)}");
  });

  it("disables conflicting students in the creation picker", () => {
    expect(createEventPage).toContain("findEventParticipantScheduleConflicts");
    expect(createEventPage).toContain("blockedParticipants");
    expect(createEventPage).toContain("disabled={Boolean(conflict)}");
    expect(createEventPage).toContain("eligibleFilteredStudents");
  });
});
