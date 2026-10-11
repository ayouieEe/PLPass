import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const participantMigration = readFileSync(
  "supabase/migrations/20261011180000_remove_duplicate_participant_invitation_notification.sql",
  "utf8"
);

const rescheduleMigration = readFileSync(
  "supabase/migrations/20261011181000_unify_event_notification_content_and_email_delivery.sql",
  "utf8"
);

describe("participant invitation notification deduplication", () => {
  it("leaves in-app invitations to the dedicated trigger and preserves the email outbox write", () => {
    expect(participantMigration).toContain("insert into public.event_email_outbox");
    expect(participantMigration).toContain("on conflict (event_id, recipient_profile_id, notification_type, event_revision) do nothing;");
    expect(participantMigration).not.toContain("insert into public.notifications");
  });

  it("keeps the reschedule email helper email-only and makes authoritative event notifications detailed", () => {
    const emailHelper = rescheduleMigration.split("create or replace function private.queue_event_student_email(")[1].split("create or replace function private.notify_student_event_change()")[0];
    expect(emailHelper).toContain("insert into public.event_email_outbox");
    expect(emailHelper).not.toContain("insert into public.notifications");
    expect(rescheduleMigration).toContain("PLPass Event Rescheduled: %s");
    expect(rescheduleMigration).toContain("PLPass Event Invitation: %s");
    expect(rescheduleMigration).toContain("New date: %s");
  });
});
