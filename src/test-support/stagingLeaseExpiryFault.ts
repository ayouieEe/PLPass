import { getSupabaseConfig } from "@/lib/supabase/client";

const STAGING_PROJECT_REF = "fgbmbzdnrfjdudevmdcu";
const PRODUCTION_PROJECT_REF = "ouwyhaozkqvhjalqdsvc";
const CLAIM_PHASE = "claim";
const RECOVERY_PHASE = "recover";
const SESSION_MARKER = "plpass-staging-lease-expiry-claim";

function projectRefFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith(".supabase.co") ? hostname.slice(0, -".supabase.co".length) : null;
  } catch {
    return null;
  }
}

function wasClaimedThisSession(): boolean {
  try {
    return globalThis.sessionStorage?.getItem(SESSION_MARKER) === "true";
  } catch {
    return false;
  }
}

function markClaimedThisSession(): void {
  try {
    globalThis.sessionStorage?.setItem(SESSION_MARKER, "true");
  } catch {
    // The app exits immediately after a successful claim; persistence is defense in depth.
  }
}

export function isStagingLeaseExpiryBuild(mode: string, enabled: boolean): boolean {
  return mode === "staging-lease-expiry" && enabled;
}

export function validateStagingLeaseExpiryPhase(input: {
  mode: string;
  enabled: boolean;
  phase: string | undefined;
  url: string;
  autoSyncEnabled: boolean;
}): "claim" | "recover" | null {
  if (!isStagingLeaseExpiryBuild(input.mode, input.enabled)) return null;
  const projectRef = projectRefFromUrl(input.url);
  if (projectRef === PRODUCTION_PROJECT_REF) throw new Error("Staging lease-expiry testing refused the protected production project.");
  if (projectRef !== STAGING_PROJECT_REF) throw new Error("Staging lease-expiry testing requires the approved staging project.");
  if (input.autoSyncEnabled) throw new Error("Staging lease-expiry testing requires automatic sync to be disabled.");
  if (input.phase !== CLAIM_PHASE && input.phase !== RECOVERY_PHASE) {
    throw new Error("Staging lease-expiry testing requires an explicit claim or recover phase.");
  }
  if (input.phase === CLAIM_PHASE && wasClaimedThisSession()) {
    throw new Error("Staging lease-expiry claim already ran in this renderer session.");
  }
  return input.phase;
}

export async function claimOneLeaseAndExit(): Promise<boolean> {
  markClaimedThisSession();
  const claimed = await window.plpassDesktop?.claimLeaseAndExitForStagingTest?.();
  if (claimed) console.warn("[PLPASS staging lease test] One local record was leased; the app will exit before any attendance RPC.");
  return Boolean(claimed);
}

export function reportStagingLeaseRecovery(recoveredAtStartup: number): void {
  if (recoveredAtStartup > 0) {
    console.info("[PLPASS staging lease test] The expired local lease was recovered for one retry.");
  }
}

export function currentLeaseExpiryPhase(): string | undefined {
  return import.meta.env.VITE_PLPASS_STAGING_LEASE_EXPIRY_PHASE;
}

export function stagingLeaseExpiryEnabled(): boolean {
  return import.meta.env.VITE_PLPASS_STAGING_LEASE_EXPIRY_ENABLED === "true";
}

export function stagingLeaseExpiryConfigUrl(): string {
  return getSupabaseConfig().url;
}
