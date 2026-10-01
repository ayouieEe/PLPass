import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("organizer credential directory", () => {
  it("uses one organizer-scoped directory request instead of a client-side scope waterfall", () => {
    const source = read("src/features/organizer/pages/AuthenticationMethodsPage.tsx");
    expect(source).toContain("useOrganizerCredentialDirectory(scope.context, actorRole === \"organizer\")");
    expect(source).not.toContain("useParticipantsForEvents");
    expect(source).not.toContain("useStudentsByIds");
  });

  it("derives organizer scope on the server and excludes sensitive credential material", () => {
    const migration = read("supabase/migrations/20260930090000_organizer_credential_directory_rpc.sql");
    expect(migration).toContain("private.is_active_organizer()");
    expect(migration).toContain("event.organizer_id = (select private.current_organizer_id())");
    expect(migration).toContain("participant.participant_status <> 'removed'");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("revoke all on function public.organizer_list_credential_directory() from public, anon, authenticated;");
    expect(migration).not.toContain("token_hash");
    expect(migration).not.toContain("face_descriptor");
    expect(migration).not.toContain("student_face_embeddings");
  });
});
