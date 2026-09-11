import { getSupabaseConfig } from "@/lib/supabase/client";

const STAGING_PROJECT_REF = "fgbmbzdnrfjdudevmdcu";
const PRODUCTION_PROJECT_REF = "ouwyhaozkqvhjalqdsvc";

function projectRefFromUrl(url: string): string | null {
  try { const hostname = new URL(url).hostname; return hostname.endsWith(".supabase.co") ? hostname.slice(0, -".supabase.co".length) : null; }
  catch { return null; }
}

/** Test-only preflight. A terminal conflict is never automatically retried. */
export function configureStagingTerminalConflictSync(input: {
  mode: string; enabled: boolean; url: string; autoSyncEnabled: boolean; requestedBatchSize: number;
}): number {
  if (input.mode !== "staging-terminal-conflict" || !input.enabled) return input.requestedBatchSize;
  const projectRef = projectRefFromUrl(input.url);
  if (projectRef === PRODUCTION_PROJECT_REF) throw new Error("Staging conflict test refused the protected production project.");
  if (projectRef !== STAGING_PROJECT_REF) throw new Error("Staging conflict test requires the approved staging project.");
  if (input.autoSyncEnabled) throw new Error("Staging conflict test requires automatic sync to be disabled.");
  return 1;
}

export function stagingTerminalConflictEnabled(): boolean {
  return import.meta.env.MODE === "staging-terminal-conflict" && import.meta.env.VITE_PLPASS_STAGING_TERMINAL_CONFLICT_ENABLED === "true";
}

export function reportStagingTerminalConflict(): void {
  if (!stagingTerminalConflictEnabled()) return;
  configureStagingTerminalConflictSync({ mode: import.meta.env.MODE, enabled: true, url: getSupabaseConfig().url, autoSyncEnabled: false, requestedBatchSize: 1 });
  console.warn("[PLPASS staging conflict test] Server returned a terminal conflict; local record was retained without retry.");
}
