import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const provider = readFileSync(resolve(process.cwd(), "src/app/providers/DevelopmentSessionProvider.tsx"), "utf8");
const layout = readFileSync(resolve(process.cwd(), "src/app/layouts/DashboardLayout.tsx"), "utf8");

describe("offline work banner state", () => {
  it("uses the owner-scoped unresolved-work result even when diagnostic reads fail", () => {
    expect(provider).toContain("const hasWork = await window.plpassDesktop.hasUnresolvedWork(session.userId);");
    expect(provider).toContain("setHasOfflineWork(hasWork);");
    expect(provider).toContain("Promise.allSettled([");
    expect(provider).toContain('pendingResult.status === "fulfilled" ? pendingResult.value : []');
    expect(provider).toContain('preparedResult.status === "fulfilled" ? preparedResult.value : []');
  });

  it("rechecks SQLite integrity before retrying sync and clears only a stale integrity warning", () => {
    expect(provider).toContain("const integrity = await window.plpassDesktop.checkIntegrity();");
    expect(provider).toContain('offlineSyncError?.startsWith("Local offline database integrity requires review")');
    expect(provider).toContain("setReconciliationState(\"idle\");");
  });

  it("keeps the global banner limited to the connection state", () => {
    expect(layout).toContain('connectionOffline ? "Offline" : "Online"');
    expect(layout).not.toContain("Review saved work");
    expect(layout).not.toContain("Retry synchronization");
    expect(layout).not.toContain("listPendingWalkInScans(undefined, session.userId)");
  });
});
