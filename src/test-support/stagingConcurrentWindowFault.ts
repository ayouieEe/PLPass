import { getSupabaseConfig } from "@/lib/supabase/client";

const STAGING_PROJECT_REF = "fgbmbzdnrfjdudevmdcu";
const PRODUCTION_PROJECT_REF = "ouwyhaozkqvhjalqdsvc";

function projectRefFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    return hostname.endsWith(".supabase.co") ? hostname.slice(0, -".supabase.co".length) : null;
  } catch {
    return null;
  }
}

export function validateStagingConcurrentWindowTest(input: { mode: string; enabled: boolean; url: string; autoSyncEnabled: boolean }): boolean {
  if (input.mode !== "staging-concurrent-window" || !input.enabled) return false;
  const projectRef = projectRefFromUrl(input.url);
  if (projectRef === PRODUCTION_PROJECT_REF) throw new Error("Staging concurrent-window testing refused the protected production project.");
  if (projectRef !== STAGING_PROJECT_REF) throw new Error("Staging concurrent-window testing requires the approved staging project.");
  if (input.autoSyncEnabled) throw new Error("Staging concurrent-window testing requires automatic sync to be disabled.");
  return true;
}

export function stagingConcurrentWindowEnabled(): boolean {
  return import.meta.env.VITE_PLPASS_STAGING_CONCURRENT_WINDOW_ENABLED === "true";
}

export function stagingConcurrentWindowConfigUrl(): string {
  return getSupabaseConfig().url;
}

export async function coordinateConcurrentWindowSync(): Promise<boolean> {
  const api = window.plpassDesktop;
  const opened = await api?.openConcurrentWindowForStagingTest?.();
  if (opened) console.info("[PLPASS staging concurrency test] Opened the paired renderer window; trigger Retry Sync there once.");
  const paired = await api?.joinConcurrentSyncBarrierForStagingTest?.();
  if (!paired) console.warn("[PLPASS staging concurrency test] The paired renderer did not join before the bounded barrier expired; no request was sent.");
  if (paired) console.info("[PLPASS staging concurrency test] Both renderers reached the local claim barrier.");
  return Boolean(paired);
}
