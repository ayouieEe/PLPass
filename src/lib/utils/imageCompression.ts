const jpegMimeType = "image/jpeg";
const imageMimeTypes = new Set(["image/png", jpegMimeType, "image/webp"]);

export const correctionProofImageMaxDimension = 2048;

type ImageCompressionOptions = {
  maxBytes: number;
  maxDimension?: number;
};

export type OptimizedImageFile = {
  file: File;
  compressed: boolean;
};

function compressedFileName(name: string) {
  const baseName = name.replace(/\.[^/.]+$/, "") || "proof";
  return `${baseName}-compressed.jpg`;
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected image could not be read."));
    };
    image.src = objectUrl;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The selected image could not be compressed."));
    }, jpegMimeType, quality);
  });
}

function dimensionsFor(image: HTMLImageElement, maxDimension: number, scale: number) {
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const dimensionScale = Math.min(1, maxDimension / longestSide) * scale;
  return {
    width: Math.max(1, Math.round(image.naturalWidth * dimensionScale)),
    height: Math.max(1, Math.round(image.naturalHeight * dimensionScale))
  };
}

export async function optimizeImageForUpload(file: File, options: ImageCompressionOptions): Promise<OptimizedImageFile> {
  if (file.size <= options.maxBytes) return { file, compressed: false };
  if (!imageMimeTypes.has(file.type)) throw new Error("Only PNG, JPG, or WebP images can be optimized.");

  const image = await loadImage(file);
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("The selected image could not be read.");

  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image compression is unavailable in this browser.");

  const maxDimension = options.maxDimension ?? correctionProofImageMaxDimension;
  const scales = [1, 0.8, 0.64, 0.5];
  const qualities = [0.88, 0.78, 0.68, 0.58];

  for (const scale of scales) {
    const { width, height } = dimensionsFor(image, maxDimension, scale);
    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    for (const quality of qualities) {
      const blob = await canvasBlob(canvas, quality);
      if (blob.size <= options.maxBytes) {
        return {
          file: new File([blob], compressedFileName(file.name), { type: jpegMimeType, lastModified: file.lastModified }),
          compressed: true
        };
      }
    }
  }

  throw new Error("This image could not be reduced below 5 MB. Please choose a smaller image.");
}
