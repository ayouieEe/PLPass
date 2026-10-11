import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261011100000_remove_offline_face_embedding_dependency.sql", "utf8");

describe("offline package facial-recognition removal", () => {
  it("keeps offline packages limited to QR/manual data", () => {
    expect(migration).toContain("create or replace function public.prepare_offline_event_package");
    expect(migration).toContain("'qrIdentifier', q.id");
    expect(migration).not.toContain("student_face_embeddings");
    expect(migration).not.toContain("faceEmbeddings");
    expect(migration).toContain("grant execute on function public.prepare_offline_event_package(uuid) to authenticated");
  });
});
