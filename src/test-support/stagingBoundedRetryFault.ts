import { getSupabaseConfig } from "@/lib/supabase/client";

const STAGING_PROJECT_REF = "fgbmbzdnrfjdudevmdcu";
const PRODUCTION_PROJECT_REF = "ouwyhaozkqvhjalqdsvc";
const SESSION_MARKER = "plpass-staging-bounded-retry-count";
const MAX_SIMULATED_FAILURES = 2;

function projectRefFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith(".supabase.co") ? hostname.slice(0, -".supabase.co".length) : null;
  } catch { return null; }
}

function injectedCount(): number {
  try { return Number(globalThis.sessionStorage?.getItem(SESSION_MARKER) ?? "0") || 0; }
  catch { return 0; }
}

function setInjectedCount(value: number): void {
  try { globalThis.sessionStorage?.setItem(SESSION_MARKER, String(value)); }
  catch { /* A missing session store makes this test mode inert. */ }
}

/** Test-only preflight. It refuses every project except the approved staging project. */
export function configureStagingBoundedRetrySync(input: {
  mode: string;
  enabled: boolean;
  url: string;
  autoSyncEnabled: boolean;
  requestedBatchSize: number;
}): number {
  if (input.mode !== "staging-bounded-retry" || !input.enabled) return input.requestedBatchSize;
  const projectRef = projectRefFromUrl(input.url);
  if (projectRef === PRODUCTION_PROJECT_REF) throw new Error("Staging retry test refused the protected production project.");
  if (projectRef !== STAGING_PROJECT_REF) throw new Error("Staging retry test requires the approved staging project.");
  if (input.autoSyncEnabled) throw new Error("Staging retry test requires automatic sync to be disabled.");
  return 1;
}

export function stagingBoundedRetryEnabled(): boolean {
  return import.meta.env.MODE === "staging-bounded-retry" && import.meta.env.VITE_PLPASS_STAGING_BOUNDED_RETRY_ENABLED === "true";
}

/**
 * Simulates exactly two transient failures before any attendance RPC is made.
 * No request details, identity values, or credentials are logged.
 */
export function injectStagingBoundedRetryBeforeRpc(): void {
  if (!stagingBoundedRetryEnabled()) return;
  const count = injectedCount();
  if (count >= MAX_SIMULATED_FAILURES) return;
  const config = getSupabaseConfig();
  configureStagingBoundedRetrySync({
    mode: import.meta.env.MODE,
    enabled: true,
    url: config.url,
    autoSyncEnabled: false,
    requestedBatchSize: 1
  });
  const next = count + 1;
  setInjectedCount(next);
  console.warn(`[PLPASS staging retry test] Simulated transient failure ${next} of ${MAX_SIMULATED_FAILURES} before any attendance RPC.`);
  throw new Error("PLPASS_STAGING_TEST_TRANSIENT_RETRY_FAILURE");
}
