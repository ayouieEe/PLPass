import type { ListQuery, PaginatedResult } from "@/types/filters";
import type { UserRole } from "@/types/enums";

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

export function assertRole(context: RepositoryContext, allowedRoles: UserRole[]) {
  if (!allowedRoles.includes(context.actorRole)) {
    throw new RepositoryError("Permission denied for this role.", "PERMISSION_DENIED");
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

export function matchesSearch(values: Array<string | null | undefined>, search?: string) {
  if (!search) {
    return true;
  }

  const normalizedSearch = search.trim().toLowerCase();
  return values.some((value) => (value ?? "").toLowerCase().includes(normalizedSearch));
}
