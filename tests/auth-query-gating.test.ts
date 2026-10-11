import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { hasRepositoryContext } from "@/services/repositoryUtils";

describe("authenticated query gating", () => {
  it("requires a non-empty actor ID before a protected query can run", () => {
    expect(hasRepositoryContext()).toBe(false);
    expect(hasRepositoryContext({ actorUserId: "", actorRole: "student" })).toBe(false);
    expect(hasRepositoryContext({ actorUserId: "  ", actorRole: "student" })).toBe(false);
    expect(hasRepositoryContext({ actorUserId: "user-1", actorRole: "student" })).toBe(true);
  });

  it("does not create a placeholder student context or load notifications without one", () => {
    const studentExperience = readFileSync("src/features/student/studentExperience.ts", "utf8");
    const repositoryQueries = readFileSync("src/hooks/useRepositoryQueries.ts", "utf8");

    expect(studentExperience).not.toContain('context ?? { actorUserId: "", actorRole: "student" }');
    expect(repositoryQueries).toContain("export function useNotifications");
    expect(repositoryQueries).toContain("enabled: hasRepositoryContext(context)");
  });
});
