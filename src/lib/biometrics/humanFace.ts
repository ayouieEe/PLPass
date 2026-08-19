const minimumFaceScore = 0.75;

type HumanInput = HTMLVideoElement | HTMLCanvasElement | ImageBitmap;

let humanPromise: Promise<import("@vladmandic/human").Human> | undefined;

async function getHuman() {
  if (!humanPromise) {
    humanPromise = import("@vladmandic/human").then(async ({ Human }) => {
      const human = new Human({
        backend: "webgl",
        debug: false,
        warmup: "none",
        modelBasePath: "/human-models/",
        face: {
          enabled: true,
          detector: { enabled: true, maxDetected: 2, minConfidence: minimumFaceScore },
          description: { enabled: true, minConfidence: minimumFaceScore },
          mesh: { enabled: false },
          emotion: { enabled: false },
          iris: { enabled: false },
          antispoof: { enabled: false },
          liveness: { enabled: false }
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        segmentation: { enabled: false }
      });
      await human.load();
      return human;
    }).catch((error) => {
      humanPromise = undefined;
      throw error;
    });
  }
  return humanPromise;
}

export async function prepareFaceRecognition() {
  await getHuman();
}

export type FaceDescriptorResult = {
  descriptor: number[];
  confidence: number;
};

export async function extractFaceDescriptor(input: HumanInput): Promise<FaceDescriptorResult> {
  const human = await getHuman();
  const result = await human.detect(input);
  const detectedFaces = result.face.filter((face) => face.embedding && face.score >= minimumFaceScore);

  if (detectedFaces.length !== 1) {
    throw new Error(detectedFaces.length > 1 ? "Only one face may be visible." : "No clear face was detected.");
  }

  const face = detectedFaces[0];
  return { descriptor: [...(face.embedding ?? [])], confidence: face.score };
}

export async function extractFaceDescriptorFromFile(file: File): Promise<FaceDescriptorResult> {
  const bitmap = await createImageBitmap(file);
  try {
    return await extractFaceDescriptor(bitmap);
  } finally {
    bitmap.close();
  }
}

export function faceSimilarity(reference: number[], candidate: number[]): number {
  if (reference.length !== candidate.length || reference.length === 0) return 0;

  let dotProduct = 0;
  let referenceMagnitude = 0;
  let candidateMagnitude = 0;
  for (let index = 0; index < reference.length; index += 1) {
    dotProduct += reference[index] * candidate[index];
    referenceMagnitude += reference[index] ** 2;
    candidateMagnitude += candidate[index] ** 2;
  }
  return dotProduct / (Math.sqrt(referenceMagnitude) * Math.sqrt(candidateMagnitude));
}
