import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";

describe("App", () => {
  it("opens the login page at the public root", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /Sign in to PLPass/i })).toBeInTheDocument();
    expect(screen.getByText(/Use your PLPass account to open your assigned workspace/i)).toBeInTheDocument();
  });
});
