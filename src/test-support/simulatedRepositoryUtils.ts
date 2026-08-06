import { developmentErrorToggle, type SimulatedErrorMode } from "@/test-support/developmentErrorToggle";
import { RepositoryError } from "@/services/repositoryUtils";
export {
  assertRole,
  defaultRepositoryContext,
  matchesSearch,
  paginate,
  RepositoryError,
  type RepositoryContext
} from "@/services/repositoryUtils";

export async function simulatedDelay(ms = 120) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function applySimulationMode(repositoryName: string) {
  const mode = developmentErrorToggle.getMode(repositoryName);
  await simulatedDelay();

  if (mode === "none") {
    return;
  }

  throw createModeError(mode);
}

export function createModeError(mode: Exclude<SimulatedErrorMode, "none">): RepositoryError {
  if (mode === "empty") {
    return new RepositoryError("No records matched the mock repository request.", "EMPTY_RESULT");
  }
  if (mode === "not_found") {
    return new RepositoryError("The requested mock record was not found.", "NOT_FOUND");
  }
  if (mode === "permission_denied") {
    return new RepositoryError("The current development role cannot access this mock resource.", "PERMISSION_DENIED");
  }
  if (mode === "validation_error") {
    return new RepositoryError("The mock repository rejected the request as invalid.", "VALIDATION_ERROR");
  }
  return new RepositoryError("The mock repository simulated a server error.", "SERVER_ERROR");
}

