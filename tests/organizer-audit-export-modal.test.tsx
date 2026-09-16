import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "@/app/App";
import { queryClient } from "@/app/providers/queryClient";
import { resetSimulatedRepositoryState } from "@/test-support/repositories";

const organizerSession = JSON.stringify({
  userId: "user-organizer-1",
  role: "organizer",
  displayName: "Organizer One",
  email: "organizer.one@plpass.test",
  isAuthenticated: true
});

function setRoute(path: string) {
  window.history.pushState({}, "", path);
}

function storeSession(value: string) {
  window.localStorage.setItem("plpass-development-session", value);
}

beforeEach(() => {
  window.localStorage.clear();
  queryClient.clear();
  resetSimulatedRepositoryState();
});

afterEach(() => {
  window.localStorage.clear();
  queryClient.clear();
  resetSimulatedRepositoryState();
  setRoute("/");
});

describe("Organizer audit logs export modal", () => {
  it("opens the export report modal from the organizer audit logs page", async () => {
    storeSession(organizerSession);
    setRoute("/organizer/audit-logs");
    render(<App />);
    const user = userEvent.setup();

    expect(await screen.findByRole("heading", { name: /^audit logs$/i })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^export$/i }));

    expect(await screen.findByRole("dialog", { name: /export audit report/i })).toBeInTheDocument();
    expect(screen.getByText(/audit activity directory/i)).toBeInTheDocument();
  });
});
