import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { repositories } from "@/services/repositories";
import type { EventResource } from "@/types/domain";

export const EVENT_RESOURCE_BUCKET = "event-resources";
export const MAX_EVENT_RESOURCES = 5;
export const MAX_EVENT_RESOURCE_BYTES = 25 * 1024 * 1024;

export type PendingEventResource =
  | { id: string; kind: "file"; title: string; file: File }
  | { id: string; kind: "link"; title: string; externalUrl: string };

function resourceTitle(value: string, fallback: string) {
  return value.trim() || fallback;
}

function safeFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "attachment";
}

export function isSecureResourceUrl(value: string) {
  return /^https:\/\//i.test(value.trim());
}

export function formatResourceFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
}

export function eventResourceErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (/bucket not found|bucket.*does not exist/i.test(message)) {
    return "File uploads are not set up yet. Apply the latest Supabase migration, then try again.";
  }
  return message || fallback;
}

export async function createEventLinkResource(eventId: string, title: string, externalUrl: string) {
  const url = externalUrl.trim();
  if (!isSecureResourceUrl(url)) throw new Error("Resource links must use HTTPS.");

  return repositories.eventManagement.addEventResource({
    eventId,
    title: resourceTitle(title, "Event resource"),
    externalUrl: url
  });
}

export async function uploadEventFileResource(eventId: string, title: string, file: File) {
  if (file.size > MAX_EVENT_RESOURCE_BYTES) {
    throw new Error("Each attached file must be 25 MB or smaller.");
  }

  const client = getSupabaseBrowserClient();
  const objectPath = `${eventId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
  const { error: uploadError } = await client.storage
    .from(EVENT_RESOURCE_BUCKET)
    .upload(objectPath, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) throw uploadError;

  try {
    return await repositories.eventManagement.addEventResource({
      eventId,
      title: resourceTitle(title, file.name),
      storageBucket: EVENT_RESOURCE_BUCKET,
      storageObjectPath: objectPath
    });
  } catch (error) {
    await client.storage.from(EVENT_RESOURCE_BUCKET).remove([objectPath]);
    throw error;
  }
}

export async function savePendingEventResource(eventId: string, resource: PendingEventResource) {
  if (resource.kind === "link") {
    return createEventLinkResource(eventId, resource.title, resource.externalUrl);
  }
  return uploadEventFileResource(eventId, resource.title, resource.file);
}

export async function removeEventResource(resource: EventResource) {
  const client = getSupabaseBrowserClient();
  await repositories.eventManagement.removeEventResource(resource.id);
  if (resource.storageBucket && resource.storageObjectPath) {
    const { error: storageError } = await client.storage.from(resource.storageBucket).remove([resource.storageObjectPath]);
    if (storageError) throw storageError;
  }
}

export async function getEventResourceDownloadUrl(resource: EventResource) {
  if (resource.externalUrl) return resource.externalUrl;
  if (!resource.storageBucket || !resource.storageObjectPath) throw new Error("This resource is unavailable.");
  const { data, error } = await getSupabaseBrowserClient().storage
    .from(resource.storageBucket)
    .createSignedUrl(resource.storageObjectPath, 60 * 10, { download: resource.title });
  if (error || !data?.signedUrl) throw error ?? new Error("Unable to prepare the download.");
  return data.signedUrl;
}
