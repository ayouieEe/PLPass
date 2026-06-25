export class AppError extends Error {
  constructor(
    message: string,
    public readonly code = "APP_ERROR"
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "An unexpected error occurred.";
}
