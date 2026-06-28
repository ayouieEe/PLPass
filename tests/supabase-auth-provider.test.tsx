import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DevelopmentSessionProvider } from "@/app/providers/DevelopmentSessionProvider";
import { queryClient } from "@/app/providers/queryClient";
import { useDevelopmentSession } from "@/hooks/useDevelopmentSession";
import type { UserRole } from "@/types/roles";

type FakeAuthUser = {
  id: string;
  email: string;
};

type FakeState = {
  role: UserRole;
  signedInUser: FakeAuthUser | null;
  signOutCalls: number;
};

const fakeState = vi.hoisted<FakeState>(() => ({
  role: "faculty",
  signedInUser: null,
  signOutCalls: 0
}));

vi.mock("@/lib/config/dataSource", () => ({
  getDataSource: () => "supabase",
  isSupabaseDataSource: () => true
}));

class FakeSupabaseQueryBuilder {
  private filters: Array<{ column: string; value: string }> = [];

  constructor(private readonly tableName: string) {}

  select() {
    return this;
  }

  eq(column: string, value: string) {
    this.filters.push({ column, value });
    return this;
  }

  async maybeSingle() {
    return { data: this.rows()[0] ?? null, error: null };
  }

  async limit(count: number) {
    return { data: this.rows().slice(0, count), error: null };
  }

  private rows(): Record<string, unknown>[] {
    const currentUser = fakeState.signedInUser;
    if (!currentUser) {
      return [];
    }

    const profile = {
      id: currentUser.id,
      role: fakeState.role,
      email: currentUser.email,
      display_name: `${fakeState.role} User`,
      account_status: "active",
      created_at: "2026-06-28T00:00:00.000Z"
    };
    const roleRows: Record<string, Record<string, unknown>[]> = {
      profiles: [profile],
      students: [{ id: "student-live-1", profile_id: currentUser.id }],
      faculty: [{ id: "faculty-live-1", profile_id: currentUser.id }],
      organizers: [{ id: "organizer-live-1", profile_id: currentUser.id }],
      dean_assignments: [{ id: "assignment-live-1", profile_id: currentUser.id, department_id: "department-live-1" }]
    };

    return (roleRows[this.tableName] ?? []).filter((row) =>
      this.filters.every((filter) => row[filter.column] === filter.value)
    );
  }
}

const fakeSupabase = {
  auth: {
    async getUser() {
      return { data: { user: fakeState.signedInUser }, error: null };
    },
    async signInWithPassword({ email }: { email: string; password: string }) {
      fakeState.signedInUser = { id: `profile-${fakeState.role}`, email };
      return {
        data: { user: fakeState.signedInUser, session: { user: fakeState.signedInUser } },
        error: null
      };
    },
    async signOut() {
      fakeState.signOutCalls += 1;
      fakeState.signedInUser = null;
      return { error: null };
    }
  },
  from(tableName: string) {
    return new FakeSupabaseQueryBuilder(tableName);
  }
};

vi.mock("@/lib/supabase/client", () => ({
  getSupabaseBrowserClient: () => fakeSupabase,
  resetSupabaseBrowserClientForTests: () => undefined
}));

function AuthProbe() {
  const { session, signInWithPassword, logout, isSessionRestored } = useDevelopmentSession();
  return (
    <div>
      <p>restored: {String(isSessionRestored)}</p>
      <p>role: {session?.role ?? "none"}</p>
      <p>email: {session?.email ?? "none"}</p>
      <button type="button" onClick={() => void signInWithPassword(`${fakeState.role}@plpass.test`, "password")}>
        sign in
      </button>
      <button type="button" onClick={logout}>
        logout
      </button>
    </div>
  );
}

function renderProvider() {
  return render(
    <DevelopmentSessionProvider>
      <AuthProbe />
    </DevelopmentSessionProvider>
  );
}

afterEach(() => {
  fakeState.role = "faculty";
  fakeState.signedInUser = null;
  fakeState.signOutCalls = 0;
  queryClient.clear();
});

describe("live Supabase auth provider", () => {
  it.each(["admin", "faculty", "organizer", "student"] as const)("completes successful %s login resolution", async (role) => {
    fakeState.role = role;
    const user = userEvent.setup();
    renderProvider();

    await screen.findByText("restored: true");
    await user.click(screen.getByRole("button", { name: "sign in" }));

    await screen.findByText(`role: ${role}`);
    expect(screen.getByText(`email: ${role}@plpass.test`)).toBeInTheDocument();
  });

  it("restores a browser session after refresh", async () => {
    fakeState.role = "student";
    fakeState.signedInUser = { id: "profile-student", email: "student@plpass.test" };

    renderProvider();

    await screen.findByText("restored: true");
    expect(screen.getByText("role: student")).toBeInTheDocument();
  });

  it("logs out and clears the live session", async () => {
    fakeState.role = "organizer";
    fakeState.signedInUser = { id: "profile-organizer", email: "organizer@plpass.test" };
    const user = userEvent.setup();
    renderProvider();

    await screen.findByText("role: organizer");
    await user.click(screen.getByRole("button", { name: "logout" }));

    await waitFor(() => expect(screen.getByText("role: none")).toBeInTheDocument());
    expect(fakeState.signOutCalls).toBe(1);
  });

  it("switches between live accounts without keeping the previous role", async () => {
    const user = userEvent.setup();
    const view = renderProvider();

    fakeState.role = "faculty";
    await screen.findByText("restored: true");
    await user.click(screen.getByRole("button", { name: "sign in" }));
    await screen.findByText("role: faculty");
    view.unmount();

    fakeState.role = "student";
    fakeState.signedInUser = null;
    renderProvider();
    await screen.findByText("restored: true");
    await user.click(screen.getByRole("button", { name: "sign in" }));

    await screen.findByText("role: student");
    expect(screen.queryByText("role: faculty")).not.toBeInTheDocument();
  });
});
