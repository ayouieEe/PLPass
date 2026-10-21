import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "@/app/App";

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
    render(<App />);

    expect(await screen.findByRole("heading", { name: /plpass for university events/i })).toBeInTheDocument();
    expect(screen.getByText(/installer will appear here/i)).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /sign in/i }).some((link) => link.getAttribute("href") === "/login")).toBe(true);
  });

  it("uses a configured HTTPS desktop download URL", async () => {
    vi.stubEnv("VITE_DESKTOP_DOWNLOAD_URL", "https://downloads.example.test/PLPass-Desktop-Setup.exe");
    setRoute("/");
    render(<App />);

    expect(await screen.findByRole("link", { name: /download desktop app/i })).toHaveAttribute("href", "https://downloads.example.test/PLPass-Desktop-Setup.exe");
  });
});
