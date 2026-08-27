export class RequestTimeoutError extends Error {
  readonly code = "REQUEST_TIMEOUT";

  constructor(message: string) {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

export function withRequestTimeout<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => reject(new RequestTimeoutError(message)), timeoutMs);

    operation.then(
      (value) => {
        globalThis.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}
