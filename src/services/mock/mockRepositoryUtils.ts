import type { ListQuery, PaginatedResult } from "@/types/filters";
import type { UserRole } from "@/types/enums";
import { developmentErrorToggle, type MockErrorMode } from "@/services/mock/developmentErrorToggle";

export type RepositoryContext = {
  actorUserId: string;
  actorRole: UserRole;
};

export class RepositoryError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "EMPTY_RESULT"
      | "NOT_FOUND"
      | "PERMISSION_DENIED"
      | "VALIDATION_ERROR"
      | "SERVER_ERROR"
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

export const defaultRepositoryContext: RepositoryContext = {
  actorUserId: "user-admin-1",
  actorRole: "admin"
};

export async function mockDelay(ms = 120) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function applyMockMode(repositoryName: string) {
  const mode = developmentErrorToggle.getMode(repositoryName);
  await mockDelay();

  if (mode === "none") {
    return;
  }

  throw createModeError(mode);
}

export function createModeError(mode: Exclude<MockErrorMode, "none">): RepositoryError {
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

export function assertRole(context: RepositoryContext, allowedRoles: UserRole[]) {
  if (!allowedRoles.includes(context.actorRole)) {
    throw new RepositoryError("Permission denied for this development role.", "PERMISSION_DENIED");
  }
}

export function paginate<T>(items: T[], query: Partial<ListQuery> = {}): PaginatedResult<T> {
  const pageIndex = query.pageIndex ?? 0;
  const pageSize = query.pageSize ?? 10;
  const start = pageIndex * pageSize;
  const pageItems = items.slice(start, start + pageSize);

  return {
    items: pageItems,
    total: items.length,
    pageIndex,
    pageSize,
    pageCount: Math.max(1, Math.ceil(items.length / pageSize))
  };
}

export function matchesSearch(values: string[], search?: string) {
  if (!search) {
    return true;
  }

  const normalizedSearch = search.trim().toLowerCase();
  return values.some((value) => value.toLowerCase().includes(normalizedSearch));
}
