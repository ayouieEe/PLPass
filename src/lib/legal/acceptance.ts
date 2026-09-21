import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { LEGAL_DOCUMENTS, LEGAL_POLICY_VERSION, type LegalDocumentType } from "@/lib/legal/policies";

const localAcceptanceKey = "plpass-legal-acceptance";

function isLocalMode() {
  return import.meta.env.VITE_DATA_SOURCE === "mock" || import.meta.env.MODE === "test";
}

function isTestMode() {
  return import.meta.env.MODE === "test";
}

function getLocalAcceptances(userId: string): Set<LegalDocumentType> {
  try {
    const value = JSON.parse(window.localStorage.getItem(localAcceptanceKey) ?? "{}") as Record<string, string[]>;
    return new Set((value[userId] ?? []).filter((item): item is LegalDocumentType => item === "terms" || item === "privacy"));
  } catch {
    return new Set();
  }
}

export async function getLegalAcceptanceStatus(userId: string): Promise<Record<LegalDocumentType, boolean>> {
  // The E2E browser runs the production build against mock repositories. Treat
  // its seeded development identities like unit-test identities so journeys
  // test their intended workspace instead of being diverted by the real
  // Supabase legal-acceptance gate.
  if (isTestMode() || import.meta.env.VITE_DATA_SOURCE === "mock") return { terms: true, privacy: true };
  if (isLocalMode()) {
    const accepted = getLocalAcceptances(userId);
    return { terms: accepted.has("terms"), privacy: accepted.has("privacy") };
  }
  const { data, error } = await getSupabaseBrowserClient()
    .from("legal_acceptances")
    .select("document_type")
    .eq("user_id", userId)
    .eq("document_version", LEGAL_POLICY_VERSION);
  if (error) throw error;
  const accepted = new Set((data ?? []).map((row) => row.document_type));
  return { terms: accepted.has("terms"), privacy: accepted.has("privacy") };
}

export async function acceptCurrentLegalDocuments(userId: string) {
  if (isLocalMode()) {
    let value: Record<string, string[]> = {};
    try { value = JSON.parse(window.localStorage.getItem(localAcceptanceKey) ?? "{}"); } catch { value = {}; }
    value[userId] = [...new Set([...(value[userId] ?? []), "terms", "privacy"])];
    window.localStorage.setItem(localAcceptanceKey, JSON.stringify(value));
    return;
  }
  const current = await getLegalAcceptanceStatus(userId);
  const rows = (["terms", "privacy"] as LegalDocumentType[])
    .filter((documentType) => !current[documentType])
    .map((documentType) => ({ user_id: userId, document_type: documentType, document_version: LEGAL_POLICY_VERSION }));
  if (rows.length === 0) return;
  const { error } = await getSupabaseBrowserClient().from("legal_acceptances").insert(rows);
  if (error) throw error;
}

export function allCurrentLegalDocumentsAccepted(status?: Partial<Record<LegalDocumentType, boolean>>) {
  return Boolean(status?.terms && status?.privacy);
}

export { LEGAL_DOCUMENTS, LEGAL_POLICY_VERSION };
