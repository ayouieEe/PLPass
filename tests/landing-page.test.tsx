import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudentApp } from "@/app/StudentApp";

function setRoute(path: string) {
  window.history.pushState({}, "", path);
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  setRoute("/");
});

describe("public landing page", () => {
  it("shows the desktop release state and sign-in path", async () => {
    render(<StudentApp />);

    expect(await screen.findByRole("heading", { name: /plpass for university events/i })).toBeInTheDocument();
    expect(screen.getByText(/installer will appear here/i)).toBeInTheDocument();
    expect(screen.getByText(/choose your workspace/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /continue to student sign in/i })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("button", { name: /go to slide/i })).not.toBeInTheDocument();
  });

  it("uses a configured HTTPS desktop download URL", async () => {
    vi.stubEnv("VITE_DESKTOP_DOWNLOAD_URL", "https://downloads.example.test/PLPass-Desktop-Setup.exe");
    setRoute("/");
    render(<StudentApp />);

    expect(await screen.findByRole("link", { name: /download desktop app/i })).toHaveAttribute("href", "https://downloads.example.test/PLPass-Desktop-Setup.exe");
  });
});
