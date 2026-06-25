import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "@/app/App";

describe("App", () => {
  it("renders the Phase 0 home page", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: /PLPass is ready for Phase 0 development/i })).toBeInTheDocument();
    expect(screen.getByText(/Supabase and attendance workflows remain untouched/i)).toBeInTheDocument();
  });
});
