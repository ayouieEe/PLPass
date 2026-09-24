import { describe, expect, it } from "vitest";
import { generateAccountEmail } from "@/lib/utils/accountEmail";

describe("generated account email", () => {
  it("joins surname and first name, excluding the middle name", () => {
    expect(generateAccountEmail("Faustino", "Justine", "Angelo")).toBe("faustino_justine@plpasig.edu.ph");
  });

  it("places a compacted name extension after the surname", () => {
    expect(generateAccountEmail("Balbacal", "Chrisha", "Mazel", "Jr.")).toBe("balbacaljr_chrisha@plpasig.edu.ph");
  });

  it("removes punctuation and accents consistently", () => {
    expect(generateAccountEmail("Dela Cruz", "José", "Anne-Marie")).toBe("delacruz_jose@plpasig.edu.ph");
  });

  it("returns empty until both required name parts exist", () => {
    expect(generateAccountEmail("", "Justine")).toBe("");
    expect(generateAccountEmail("Faustino", "")).toBe("");
  });
});
