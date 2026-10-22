import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("shows the informational landing page and public navigation", async () => {
    render(<StudentApp />);

    expect(await screen.findByRole("heading", { name: /a clearer way to manage every event/i })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: /public navigation/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "#home");
    expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute("href", "#download");
    expect(screen.getByRole("link", { name: "FAQs" })).toHaveAttribute("href", "#faqs");
    expect(screen.getByRole("link", { name: /log in/i })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: /terms of use/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /privacy policy/i })).not.toBeInTheDocument();
    expect(screen.getByText(/student & staff attendance workspace/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /set up your desktop workspace/i })).toBeInTheDocument();
    expect(screen.getByText("Download", { selector: "h3" })).toBeInTheDocument();
    expect(screen.getByText("Install", { selector: "h3" })).toBeInTheDocument();
    expect(screen.getByText("Sign in", { selector: "h3" })).toBeInTheDocument();
  });

  it("uses a configured HTTPS desktop download URL", async () => {
    vi.stubEnv("VITE_DESKTOP_DOWNLOAD_URL", "https://downloads.example.test/PLPass-Desktop-Setup.exe");
    setRoute("/");
    render(<StudentApp />);

    expect(await screen.findByRole("link", { name: /download plpass for windows/i })).toHaveAttribute("href", "https://downloads.example.test/PLPass-Desktop-Setup.exe");
  });

  it("opens one public FAQ answer at a time", async () => {
    const user = userEvent.setup();
    render(<StudentApp />);

    const faq = await screen.findByRole("button", { name: /what is plpass/i });
    expect(faq).toHaveAttribute("aria-expanded", "false");
    await user.click(faq);
    expect(faq).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/attendance workspace for university events/i)).toBeVisible();
  });
});
