import { describe, expect, it, vi } from "vitest";
import { faceSimilarity, prepareFaceRecognition } from "@/lib/biometrics/humanFace";

const { humanLoad, HumanMock } = vi.hoisted(() => {
  const load = vi.fn().mockResolvedValue(undefined);
  return {
    humanLoad: load,
    HumanMock: vi.fn().mockImplementation(() => ({ load }))
  };
});

vi.mock("@vladmandic/human", () => ({ Human: HumanMock }));

describe("optional feature loading", () => {
  it("does not initialize facial-recognition models for lightweight similarity calculations", async () => {
    expect(faceSimilarity([1, 0], [1, 0])).toBe(1);
    expect(HumanMock).not.toHaveBeenCalled();
    expect(humanLoad).not.toHaveBeenCalled();

    await prepareFaceRecognition();

    expect(HumanMock).toHaveBeenCalledOnce();
    expect(humanLoad).toHaveBeenCalledOnce();
  });
});
