import { describe, expect, it } from "vitest";
import { generateAccountEmail } from "@/lib/utils/accountEmail";

describe("generated account email", () => {
  it("joins surname, first name, and middle name without spaces", () => {
    expect(generateAccountEmail("Faustino", "Justine", "Angelo")).toBe("faustino_justineangelo@plpasig.edu.ph");
  });

  it("removes punctuation and accents consistently", () => {
    expect(generateAccountEmail("Dela Cruz", "José", "Anne-Marie")).toBe("delacruz_joseannemarie@plpasig.edu.ph");
  });

  it("returns empty until both required name parts exist", () => {
    expect(generateAccountEmail("", "Justine")).toBe("");
    expect(generateAccountEmail("Faustino", "")).toBe("");
  });
});
