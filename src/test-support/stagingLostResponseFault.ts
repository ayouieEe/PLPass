import { getSupabaseConfig } from "@/lib/supabase/client";

const STAGING_PROJECT_REF = "fgbmbzdnrfjdudevmdcu";
const PRODUCTION_PROJECT_REF = "ouwyhaozkqvhjalqdsvc";
const SESSION_MARKER = "plpass-staging-lost-response-injected";

let injected = false;

function projectRefFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith(".supabase.co") ? hostname.slice(0, -".supabase.co".length) : null;
  } catch {
    return null;
  }
}

function wasInjectedThisSession(): boolean {
  try {
    return injected || globalThis.sessionStorage?.getItem(SESSION_MARKER) === "true";
  } catch {
    return injected;
  }
}

function markInjectedThisSession(): void {
  injected = true;
  try {
    globalThis.sessionStorage?.setItem(SESSION_MARKER, "true");
  } catch {
    // The in-memory guard still prevents a second injection in this renderer.
  }
}

/** Test-only: ordinary and packaged production builds cannot activate this. */
export function shouldInjectStagingLostResponse(input: {
  mode: string;
  enabled: boolean;
  url: string;
  alreadyInjected: boolean;
}): boolean {
  if (input.mode !== "staging-fault" || !input.enabled || input.alreadyInjected) return false;
  return projectRefFromUrl(input.url) === STAGING_PROJECT_REF;
}

/**
 * Test-only preflight. When armed, one manual sync may claim exactly one row.
 * The preflight fails closed for production, every other project, and auto sync.
 */
export function configureStagingLostResponseSync(input: {
  mode: string;
  enabled: boolean;
  url: string;
  autoSyncEnabled: boolean;
  requestedBatchSize: number;
}): number {
  if (input.mode !== "staging-fault" || !input.enabled) return input.requestedBatchSize;

  const projectRef = projectRefFromUrl(input.url);
  if (projectRef === PRODUCTION_PROJECT_REF) {
    throw new Error("Staging fault injection refused the protected production project.");
  }
  if (projectRef !== STAGING_PROJECT_REF) {
    throw new Error("Staging fault injection requires the approved staging project.");
  }
  if (input.autoSyncEnabled) {
    throw new Error("Staging fault injection requires automatic sync to be disabled.");
  }
  if (wasInjectedThisSession()) {
    throw new Error("Staging fault injection already ran in this desktop session.");
  }
  return 1;
}

export function injectStagingLostResponseOnceAfterSuccess(): void {
  if (import.meta.env.MODE !== "staging-fault" || import.meta.env.VITE_PLPASS_STAGING_FAULT_LOST_RESPONSE_ONCE !== "true" || wasInjectedThisSession()) return;
  const config = getSupabaseConfig();
  if (!shouldInjectStagingLostResponse({
    mode: import.meta.env.MODE,
    enabled: true,
    url: config.url,
    alreadyInjected: wasInjectedThisSession()
  })) return;

  markInjectedThisSession();
  // Deliberately logs no request body, response, token, or header.
  console.warn("[PLPASS staging fault] Simulated one lost attendance-sync response after server success.");
  throw new Error("PLPASS_STAGING_TEST_LOST_RESPONSE_AFTER_SERVER_SUCCESS");
}

export function reportStagingLostResponseUuidRecovery(): void {
  if (import.meta.env.MODE !== "staging-fault" || !wasInjectedThisSession()) return;
  // Deliberately logs no UUID, row data, token, header, or personal information.
  console.info("[PLPASS staging fault] UUID recovery found the committed central record.");
}
