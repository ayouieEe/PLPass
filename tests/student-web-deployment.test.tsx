import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { StudentApp } from "@/app/StudentApp";
import { queryClient } from "@/app/providers/queryClient";
import { developmentErrorToggle } from "@/test-support/developmentErrorToggle";
import { resetSimulatedRepositoryState } from "@/test-support/repositories";

function setRoute(path: string) {
  window.history.pushState({}, "", path);
}

function storeSession(session: object) {
  window.localStorage.setItem("plpass-development-session", JSON.stringify(session));
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  queryClient.clear();
  developmentErrorToggle.reset();
  resetSimulatedRepositoryState();
  vi.unstubAllEnvs();
  setRoute("/");
});

describe("student web deployment", () => {
  it("registers only the student web entry and Vercel SPA rewrite", () => {
    const router = readFileSync(resolve(process.cwd(), "src/app/router/StudentAppRouter.tsx"), "utf8");
    const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
      buildCommand: string;
      outputDirectory: string;
      rewrites: Array<{ destination: string }>;
    };

    expect(router).toContain("APP_ROUTES.studentDashboard");
    expect(router).toContain("APP_ROUTES.studentProfile");
    expect(router).toContain("APP_ROUTES.notifications");
    expect(router).not.toContain("APP_ROUTES.organizer");
    expect(router).not.toContain("APP_ROUTES.admin");
    expect(router).not.toContain("APP_ROUTES.department");
    expect(vercel).toMatchObject({ buildCommand: "npm run build:student", outputDirectory: "dist" });
    expect(vercel.rewrites).toEqual([{ source: "/(.*)", destination: "/student.html" }]);
  });

  it("renders a student workspace from the student-only entry", async () => {
    storeSession({ userId: "user-student-1", role: "student", displayName: "Student 01", email: "student.1@plpass.test", isAuthenticated: true });
    setRoute("/student/dashboard");
    render(<StudentApp />);

    expect(await screen.findByRole("heading", { name: /Welcome back/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "student navigation" })).toBeInTheDocument();
  });

  it("shows the shared landing page before student sign-in", async () => {
    vi.stubEnv("VITE_DESKTOP_DOWNLOAD_URL", "https://github.com/ayouieEe/PLPass/releases/latest/download/PLPass-Setup.exe");
    render(<StudentApp />);

    expect(await screen.findByRole("heading", { name: /plpass for university events/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download desktop app/i })).toHaveAttribute(
      "href",
      "https://github.com/ayouieEe/PLPass/releases/latest/download/PLPass-Setup.exe"
    );
    expect(screen.getAllByRole("link", { name: /sign in/i }).some((link) => link.getAttribute("href") === "/login")).toBe(true);
  });

  it.each(["/login", "/forgot-password", "/terms", "/privacy"])("does not reopen public route %s for an active student", async (path) => {
    storeSession({ userId: "user-student-1", role: "student", displayName: "Student 01", email: "student.1@plpass.test", isAuthenticated: true });
    setRoute(path);
    render(<StudentApp />);

    expect(await screen.findByRole("heading", { name: /Welcome back/i })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/student/dashboard");
  });

  it("rejects staff accounts before opening the student workspace", async () => {
    storeSession({ userId: "user-organizer-1", role: "organizer", displayName: "Organizer", email: "organizer@plpass.test", isAuthenticated: true });
    setRoute("/student/dashboard");
    render(<StudentApp />);

    expect(await screen.findByRole("heading", { name: /sign in to plpass/i })).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(/student portal accepts student accounts only/i);
    expect(screen.queryByRole("navigation", { name: "student navigation" })).not.toBeInTheDocument();
  });

  it("rejects staff accounts at student-web sign-in", async () => {
    const user = userEvent.setup();
    setRoute("/login");
    render(<StudentApp />);

    await user.type(await screen.findByLabelText(/email/i), "organizer.one@plpass.test");
    await user.type(screen.getByLabelText(/^password$/i), "password123");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/student portal accepts student accounts only/i);
    expect(window.localStorage.getItem("plpass-development-session")).toBeNull();
  });

  it("explains that staff routes belong in the desktop app", async () => {
    storeSession({ userId: "user-student-1", role: "student", displayName: "Student 01", email: "student.1@plpass.test", isAuthenticated: true });
    setRoute("/organizer/events");
    render(<StudentApp />);

    expect(await screen.findByRole("heading", { name: /use plpass desktop/i })).toBeInTheDocument();
  });
});
