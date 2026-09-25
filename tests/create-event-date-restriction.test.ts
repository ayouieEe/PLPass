import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/features/organizer/pages/CreateEventPage.tsx", "utf8");

describe("create event date restriction", () => {
  it("uses the Manila calendar date as the date picker minimum", () => {
    expect(page).toContain('<DatePickerField control={form.control} name="date" label="Date" min={dateKey(new Date())} required />');
  });

  it("rejects dates before the current Manila date at validation time", () => {
    expect(page).toContain("const today = dateKey(new Date());");
    expect(page).toContain("if (!today || !value.date || value.date < today)");
  });
});
