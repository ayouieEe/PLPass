import { describe, expect, it, vi } from "vitest";
import { AuthWeakPasswordError } from "@supabase/auth-js";
import { establishPasswordRecoverySession, saveRecoveredPassword } from "@/lib/auth/recovery";

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key))
  };
}

function createClient(session: unknown | null = { user: { id: "recovery-user" } }) {
  return {
    auth: {
      exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }),
      setSession: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null })
    }
  };
}

describe("password recovery links", () => {
  it("accepts PKCE and implicit recovery links and stores a tab-only marker", async () => {
    const storage = createStorage();
    const pkceClient = createClient();
    const implicitClient = createClient();

    await expect(establishPasswordRecoverySession(pkceClient, { search: "?code=one-time-code", hash: "" }, storage)).resolves.toBe(true);
    await expect(establishPasswordRecoverySession(implicitClient, {
      search: "",
      hash: "#access_token=access-token&refresh_token=refresh-token&type=recovery"
    }, storage)).resolves.toBe(true);

    expect(pkceClient.auth.exchangeCodeForSession).toHaveBeenCalledWith("one-time-code");
    expect(implicitClient.auth.setSession).toHaveBeenCalledWith({ access_token: "access-token", refresh_token: "refresh-token" });
    expect(storage.setItem).toHaveBeenCalledWith("plpass-password-recovery", "active");
  });

  it("keeps a verified recovery session usable after refresh, but rejects ordinary sessions", async () => {
    const storage = createStorage();
    const client = createClient();
    storage.setItem("plpass-password-recovery", "active");

    await expect(establishPasswordRecoverySession(client, { search: "", hash: "" }, storage)).resolves.toBe(true);
    expect(client.auth.getSession).toHaveBeenCalledOnce();

    await expect(establishPasswordRecoverySession(client, { search: "", hash: "" }, createStorage())).resolves.toBe(false);
  });

  it("clears the marker for expired, reused, and missing recovery sessions", async () => {
    const storage = createStorage();
    storage.setItem("plpass-password-recovery", "active");
    const expiredClient = createClient(null);
    const invalidLinkClient = createClient();
    invalidLinkClient.auth.setSession.mockResolvedValue({ error: new Error("expired") });

    await expect(establishPasswordRecoverySession(expiredClient, { search: "", hash: "" }, storage)).resolves.toBe(false);
    await expect(establishPasswordRecoverySession(invalidLinkClient, { search: "", hash: "#access_token=a&refresh_token=b&type=recovery" }, storage)).resolves.toBe(false);
    expect(storage.removeItem).toHaveBeenCalledWith("plpass-password-recovery");
  });

  it("preserves recovery state after policy rejection and clears it after success", async () => {
    const storage = createStorage();
    storage.setItem("plpass-password-recovery", "active");
    const client = createClient();
    client.auth.updateUser.mockResolvedValue({ error: new AuthWeakPasswordError("weak", 400, ["characters"]) });

    await expect(saveRecoveredPassword(client, "Valid-password1!", storage)).rejects.toBeInstanceOf(AuthWeakPasswordError);
    expect(storage.getItem("plpass-password-recovery")).toBe("active");

    client.auth.updateUser.mockResolvedValue({ error: null });
    await expect(saveRecoveredPassword(client, "Valid-password1!", storage)).resolves.toBeUndefined();
    expect(storage.getItem("plpass-password-recovery")).toBeNull();
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "global" });
  });
});
