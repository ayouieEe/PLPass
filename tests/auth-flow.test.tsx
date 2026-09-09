import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { queryClient } from "@/app/providers/queryClient";
import { resetSimulatedRepositoryState } from "@/test-support/repositories";
import type { UserRole } from "@/types/roles";

const storedSessions: Partial<Record<UserRole, string>> = {
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

function setRoute(path: string, state: Record<string, unknown> = {}) {
  window.history.pushState({ usr: state, key: "test", idx: 0 }, "", path);
}

function storeSession(role: UserRole) {
  const storedSession = storedSessions[role];
  if (!storedSession) {
    throw new Error(`No stored test session for role ${role}`);
  }
  window.localStorage.setItem("plpass-development-session", storedSession);
}

afterEach(() => {
  window.localStorage.clear();
  queryClient.clear();
  resetSimulatedRepositoryState();
  setRoute("/");
});

async function signIn(displayName: string) {
  const user = userEvent.setup();
  render(<App />);
  const emailMap: Record<string, string> = {
    "Organizer One": "organizer.one@plpass.test",
    "Student 01": "student.1@plpass.test"
  };
  const email = emailMap[displayName] ?? "organizer.one@plpass.test";
  await user.type(await screen.findByLabelText(/email/i), email);
  await user.type(screen.getByLabelText(/^password$/i), "password123");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("mock authentication flow", () => {
  it.each([
    ["Organizer One", /^Dashboard$/i],
    ["Student 01", /Welcome back/i]
  ])("logs in as %s and redirects by role", async (displayName, expectedHeading) => {
    setRoute("/login");
    await signIn(displayName);

    await screen.findByRole("heading", { name: expectedHeading });
  });

  it("redirects unauthenticated protected routes to login", async () => {
    setRoute("/organizer/dashboard");
    render(<App />);

    await screen.findByRole("heading", { name: /sign in to plpass/i });
  });

  it("redirects to the requested protected route when allowed after login", async () => {
    setRoute("/organizer/dashboard");
    await signIn("Organizer One");

    await screen.findByRole("heading", { name: /^Dashboard$/i });
  });

  it("redirects cross-role login attempts to the signed-in role dashboard", async () => {
    setRoute("/student/dashboard");
    await signIn("Organizer One");

    await screen.findByRole("heading", { name: /^Dashboard$/i });
  });

  it("shows access denied for authenticated cross-role routes", async () => {
    storeSession("organizer");
    setRoute("/student/dashboard");
    render(<App />);

    await screen.findByRole("heading", { name: "Access denied" });
    expect(screen.getByRole("link", { name: /return to authorized area/i })).toHaveAttribute("href", "/organizer/dashboard");
  });

  it("restores the development session after refresh", async () => {
    storeSession("organizer");
    setRoute("/organizer/dashboard");
    render(<App />);

    await screen.findByRole("heading", { name: /^Dashboard$/i });
  });

  it("keeps the login page accessible when a session already exists", async () => {
    storeSession("student");
    setRoute("/login");
    render(<App />);

    expect(await screen.findByRole("heading", { name: /sign in to plpass/i })).toBeInTheDocument();
    expect(screen.getByText(/currently signed in as Student 01/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to workspace" })).toBeInTheDocument();
  });

  it("confirms a successful password reset on the login page", async () => {
    setRoute("/login", { passwordReset: true });
    render(<App />);

    expect(await screen.findByRole("status")).toHaveTextContent("Password updated. Sign in with your new password.");
  });

  it("uses generic guidance for unsuccessful sign-in attempts", async () => {
    const user = userEvent.setup();
    setRoute("/login");
    render(<App />);

    await user.type(await screen.findByLabelText(/email/i), "unknown@example.test");
    await user.type(screen.getByLabelText(/^password$/i), "not-a-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("We couldn't sign you in with those details. Check your email and password, then try again.");
  });

  it("logs out from the profile page", async () => {
    const user = userEvent.setup();
    storeSession("organizer");
    setRoute("/profile");
    render(<App />);

    await screen.findByRole("heading", { name: "Profile" });
    await user.click(within(screen.getByRole("main")).getByRole("button", { name: /logout/i }));
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
    expect(screen.getByText("Program")).toBeInTheDocument();
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
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "unknown@example.test");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("If there is a PLPass account for that email, a reset link is on its way. Check your inbox and spam folder.")).toBeInTheDocument();
  });

  it("validates the new password before saving a recovery reset", async () => {
    const user = userEvent.setup();
    setRoute("/reset-password");
    render(<App />);

    await screen.findByRole("heading", { name: "Reset password" });
    await user.type(screen.getByLabelText("New password"), "Password1!");
    await user.type(screen.getByLabelText("Confirm password"), "Password2!");
    await user.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByText("Passwords must match.")).toBeInTheDocument();
  });

  it("shows not found behavior for signed-out users", async () => {
    setRoute("/missing-page");
    render(<App />);

    await screen.findByRole("heading", { name: "Page not found" });
    expect(screen.getByRole("link", { name: /return to login/i })).toHaveAttribute("href", "/login");
  });
});
