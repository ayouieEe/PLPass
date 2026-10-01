import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { LEGAL_DOCUMENTS, LEGAL_POLICY_VERSION, type LegalDocumentType } from "@/lib/legal/policies";

const localAcceptanceKey = "plpass-legal-acceptance";

function isLocalMode() {
  return import.meta.env.MODE === "test";
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
  if (isTestMode()) return { terms: true, privacy: true };
  if (isLocalMode()) {
    const accepted = getLocalAcceptances(userId);
    return { terms: accepted.has("terms"), privacy: accepted.has("privacy") };
  }
  const client = getSupabaseBrowserClient();
  const versions = await Promise.all((Object.keys(LEGAL_DOCUMENTS) as LegalDocumentType[]).map(async (documentType) => {
    const { data, error } = await client.rpc("get_published_legal_document" as never, { p_document_type: documentType } as never);
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { version?: string } | null;
    return [documentType, row?.version ?? ""] as const;
  }));
  const currentVersions = Object.fromEntries(versions) as Record<LegalDocumentType, string>;
  const { data, error } = await client
    .from("legal_acceptances")
    .select("document_type, document_version")
    .eq("user_id", userId)
    .in("document_version", Object.values(currentVersions));
  if (error) throw error;
  const accepted = new Set((data ?? []).map((row) => `${row.document_type}:${row.document_version}`));
  return { terms: accepted.has(`terms:${currentVersions.terms}`), privacy: accepted.has(`privacy:${currentVersions.privacy}`) };
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
  const client = getSupabaseBrowserClient();
  const versions = await Promise.all((Object.keys(LEGAL_DOCUMENTS) as LegalDocumentType[]).map(async (documentType) => {
    const { data, error } = await client.rpc("get_published_legal_document" as never, { p_document_type: documentType } as never);
    if (error) throw error;
    const row = (Array.isArray(data) ? data[0] : data) as { version?: string } | null;
    return [documentType, row?.version ?? ""] as const;
  }));
  const currentVersions = Object.fromEntries(versions) as Record<LegalDocumentType, string>;
  const rows = (["terms", "privacy"] as LegalDocumentType[])
    .filter((documentType) => !current[documentType])
    .map((documentType) => ({ user_id: userId, document_type: documentType, document_version: currentVersions[documentType] }));
  if (rows.length === 0) return;
  const { error } = await getSupabaseBrowserClient().from("legal_acceptances").insert(rows);
  if (error) throw error;
}

export function allCurrentLegalDocumentsAccepted(status?: Partial<Record<LegalDocumentType, boolean>>) {
  return Boolean(status?.terms && status?.privacy);
}

export { LEGAL_DOCUMENTS, LEGAL_POLICY_VERSION };
