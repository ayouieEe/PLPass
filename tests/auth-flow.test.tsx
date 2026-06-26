import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { queryClient } from "@/app/providers/queryClient";
import { resetMockRepositoryState } from "@/services/mock/repositories";
import type { UserRole } from "@/types/roles";

const storedSessions: Record<UserRole, string> = {
  admin: JSON.stringify({
    userId: "user-admin-1",
    role: "admin",
    displayName: "Admin One",
    email: "admin.one@plpass.test",
    isAuthenticated: true
  }),
  faculty: JSON.stringify({
    userId: "user-faculty-1",
    role: "faculty",
    displayName: "Faculty One",
    email: "faculty.one@plpass.test",
    isAuthenticated: true
  }),
  organizer: JSON.stringify({
    userId: "user-organizer-1",
    role: "organizer",
    displayName: "Organizer One",
    email: "organizer.one@plpass.test",
    isAuthenticated: true
  }),
  student: JSON.stringify({
    userId: "user-student-1",
    role: "student",
    displayName: "Student 01",
    email: "student.1@plpass.test",
    isAuthenticated: true
  })
};

function setRoute(path: string) {
  window.history.pushState({}, "", path);
}

function storeSession(role: UserRole) {
  window.localStorage.setItem("plpass-development-session", storedSessions[role]);
}

afterEach(() => {
  window.localStorage.clear();
  queryClient.clear();
  resetMockRepositoryState();
  setRoute("/");
});

async function signIn(displayName: string) {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText(displayName);
  await user.click(screen.getByText(displayName));
  await user.click(screen.getByRole("button", { name: /sign in with selected account/i }));
}

describe("mock authentication flow", () => {
  it.each([
    ["Admin One", "Admin dashboard placeholder"],
    ["Faculty One", "Faculty dashboard placeholder"],
    ["Organizer One", "Organizer dashboard placeholder"],
    ["Student 01", "Student dashboard placeholder"]
  ])("logs in as %s and redirects by role", async (displayName, expectedHeading) => {
    setRoute("/login");
    await signIn(displayName);

    await screen.findByRole("heading", { name: expectedHeading });
  });

  it("redirects unauthenticated protected routes to login", async () => {
    setRoute("/faculty/dashboard");
    render(<App />);

    await screen.findByRole("heading", { name: /sign in to plpass/i });
  });

  it("redirects to the requested protected route when allowed after login", async () => {
    setRoute("/faculty/dashboard");
    await signIn("Faculty One");

    await screen.findByRole("heading", { name: "Faculty dashboard placeholder" });
  });

  it("redirects cross-role login attempts to the signed-in role dashboard", async () => {
    setRoute("/admin/dashboard");
    await signIn("Faculty One");

    await screen.findByRole("heading", { name: "Faculty dashboard placeholder" });
  });

  it("shows access denied for authenticated cross-role routes", async () => {
    storeSession("faculty");
    setRoute("/admin/dashboard");
    render(<App />);

    await screen.findByRole("heading", { name: "Access denied" });
    expect(screen.getByRole("link", { name: /return to authorized area/i })).toHaveAttribute("href", "/faculty/dashboard");
  });

  it("restores the development session after refresh", async () => {
    storeSession("organizer");
    setRoute("/organizer/dashboard");
    render(<App />);

    await screen.findByRole("heading", { name: "Organizer dashboard placeholder" });
  });

  it("logs out from the profile page", async () => {
    const user = userEvent.setup();
    storeSession("admin");
    setRoute("/profile");
    render(<App />);

    await screen.findByRole("heading", { name: "Profile" });
    await user.click(screen.getAllByRole("button", { name: /logout/i })[1]);
    await screen.findByRole("heading", { name: /sign in to plpass/i });
    expect(window.localStorage.getItem("plpass-development-session")).toBeNull();
  });
});

describe("shared user pages", () => {
  it("shows student profile data by role", async () => {
    storeSession("student");
    setRoute("/profile");
    render(<App />);

    await screen.findByText("2026-0001");
    expect(screen.getByText("Student status")).toBeInTheDocument();
    expect(screen.getByText("Masked credential identifier")).toBeInTheDocument();
  });

  it("scopes notifications to the signed-in user and marks one as read", async () => {
    const user = userEvent.setup();
    storeSession("student");
    setRoute("/notifications");
    render(<App />);

    await screen.findByText("Attendance recorded");
    expect(screen.queryByText("Correction request")).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /mark read/i })[0]);
    await waitFor(() => expect(screen.getByText("read")).toBeInTheDocument());
  });

  it("marks all notifications as read", async () => {
    const user = userEvent.setup();
    storeSession("organizer");
    setRoute("/notifications");
    render(<App />);

    await screen.findByText("Report ready");
    await user.click(screen.getByRole("button", { name: /mark all as read/i }));
    await waitFor(() => expect(screen.getByText("0 unread")).toBeInTheDocument());
  });

  it("validates forgot password while keeping responses safe", async () => {
    const user = userEvent.setup();
    setRoute("/forgot-password");
    render(<App />);

    await screen.findByRole("heading", { name: "Forgot password" });
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "unknown@example.test");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/if that email exists/i)).toBeInTheDocument();
  });

  it("validates reset password locally", async () => {
    const user = userEvent.setup();
    setRoute("/reset-password");
    render(<App />);

    await screen.findByRole("heading", { name: "Reset password" });
    await user.type(screen.getByLabelText("New password"), "password1");
    await user.type(screen.getByLabelText("Confirm password"), "password2");
    await user.click(screen.getByRole("button", { name: "Validate reset" }));
    expect(await screen.findByText("Passwords must match.")).toBeInTheDocument();
  });

  it("shows not found behavior for signed-out users", async () => {
    setRoute("/missing-page");
    render(<App />);

    await screen.findByRole("heading", { name: "Page not found" });
    expect(screen.getByRole("link", { name: /return to login/i })).toHaveAttribute("href", "/login");
  });
});
