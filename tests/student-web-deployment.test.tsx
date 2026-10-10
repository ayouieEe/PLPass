import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

  it("keeps staff accounts out of the student workspace", async () => {
    storeSession({ userId: "user-organizer-1", role: "organizer", displayName: "Organizer", email: "organizer@plpass.test", isAuthenticated: true });
    setRoute("/student/dashboard");
    render(<StudentApp />);

    expect(await screen.findByRole("heading", { name: "Use PLPass Desktop" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "student navigation" })).not.toBeInTheDocument();
  });

  it("does not register staff routes in the student router", async () => {
    storeSession({ userId: "user-student-1", role: "student", displayName: "Student 01", email: "student.1@plpass.test", isAuthenticated: true });
    setRoute("/organizer/events");
    render(<StudentApp />);

    expect(await screen.findByRole("heading", { name: /page not found/i })).toBeInTheDocument();
  });
});
