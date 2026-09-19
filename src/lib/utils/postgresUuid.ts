// PostgreSQL accepts canonical UUIDs regardless of their version nibble. Keep
// this check structural so valid imported or legacy UUIDs are not excluded.
const postgresUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isPostgresUuid(value: unknown): value is string {
  return typeof value === "string" && postgresUuidPattern.test(value);
}

export function postgresUuidValues(values: readonly unknown[]): string[] {
  return [...new Set(values.filter(isPostgresUuid))];
}
