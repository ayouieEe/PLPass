import { afterEach, describe, expect, it, vi } from "vitest";
import { correctionProofImageMaxDimension, optimizeImageForUpload } from "@/lib/utils/imageCompression";

const maxBytes = 5 * 1024 * 1024;
const originalCreateElement = document.createElement.bind(document);

function oversizedImage(type: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg") {
  return new File([new Uint8Array(maxBytes + 1)], `phone-photo.${type.split("/")[1]}`, { type });
}

function installImageEnvironment(options: { blobSizes?: number[]; loadFails?: boolean } = {}) {
  const blobSizes = options.blobSizes ?? [maxBytes + 1, maxBytes - 1];
  const drawImage = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ drawImage })),
    toBlob: vi.fn((callback: BlobCallback) => callback(new Blob([new Uint8Array(blobSizes.shift() ?? maxBytes + 1)], { type: "image/jpeg" })))
  } as unknown as HTMLCanvasElement;

  vi.spyOn(document, "createElement").mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
    if (tagName === "canvas") return canvas;
    return originalCreateElement(tagName, options);
  }) as typeof document.createElement);
  vi.stubGlobal("Image", class {
    naturalWidth = 4032;
    naturalHeight = 3024;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_value: string) {
      queueMicrotask(() => options.loadFails ? this.onerror?.() : this.onload?.());
    }
  });
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:proof"), revokeObjectURL: vi.fn() });

  return { canvas, drawImage };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("optimizeImageForUpload", () => {
  it("keeps files already within the upload limit unchanged", async () => {
    const file = new File(["proof"], "proof.jpg", { type: "image/jpeg" });

    await expect(optimizeImageForUpload(file, { maxBytes })).resolves.toEqual({ file, compressed: false });
  });

  it.each(["image/jpeg", "image/png", "image/webp"] as const)("converts oversized %s files to a compressed JPEG", async (type) => {
    const { canvas, drawImage } = installImageEnvironment();

    const result = await optimizeImageForUpload(oversizedImage(type), { maxBytes });

    expect(result.compressed).toBe(true);
    expect(result.file.type).toBe("image/jpeg");
    expect(result.file.name).toBe(`phone-photo-compressed.jpg`);
    expect(result.file.size).toBeLessThanOrEqual(maxBytes);
    expect(canvas.width).toBe(correctionProofImageMaxDimension);
    expect(canvas.height).toBe(1536);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2048, 1536);
  });

  it("reports unreadable images and images that cannot fit the limit", async () => {
    installImageEnvironment({ loadFails: true });
    await expect(optimizeImageForUpload(oversizedImage(), { maxBytes })).rejects.toThrow("could not be read");

    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    installImageEnvironment({ blobSizes: Array(20).fill(maxBytes + 1) });
    await expect(optimizeImageForUpload(oversizedImage(), { maxBytes })).rejects.toThrow("could not be reduced below 5 MB");
  });
});
