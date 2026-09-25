import type { PreparedEventPackage } from "@/features/offline/types";

// The Event Details screen and the live workspace are separate routes.  Keep
// the result of a successful local start in renderer memory so the workspace
// can open even if a concurrent connectivity probe delays its first IPC read.
// This is intentionally not persisted: the encrypted local database remains
// the durable source of truth after a reload.
const handoffs = new Map<string, PreparedEventPackage>();

function key(organizerProfileId: string, sessionId: string) {
  return `${organizerProfileId}:${sessionId}`;
}

function isActiveLocalSession(pkg: PreparedEventPackage, sessionId: string) {
  return pkg.sessions.some(
    (session) => session.id === sessionId && ["START_PENDING", "STARTED"].includes(session.offlineLifecycle ?? "")
  );
}

export function rememberOfflineLiveSessionHandoff(
  pkg: PreparedEventPackage,
  organizerProfileId: string,
  sessionId: string
) {
  if (pkg.organizerProfileId !== organizerProfileId || !isActiveLocalSession(pkg, sessionId)) return;
  handoffs.set(key(organizerProfileId, sessionId), pkg);
}

export function readOfflineLiveSessionHandoff(organizerProfileId: string, sessionId: string) {
  const pkg = handoffs.get(key(organizerProfileId, sessionId));
  return pkg?.organizerProfileId === organizerProfileId && isActiveLocalSession(pkg, sessionId) ? pkg : null;
}

export function clearOfflineLiveSessionHandoff(organizerProfileId: string, sessionId: string) {
  handoffs.delete(key(organizerProfileId, sessionId));
}
