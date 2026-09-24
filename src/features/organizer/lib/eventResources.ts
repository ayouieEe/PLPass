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

function fileExtension(value: string) {
  const match = value.trim().match(/\.([a-zA-Z0-9]{1,12})$/);
  return match?.[1]?.toLowerCase() ?? "";
}

function extensionForContentType(contentType: string | undefined) {
  const normalized = contentType?.split(";", 1)[0].trim().toLowerCase();
  const extensions: Record<string, string> = {
    "application/pdf": "pdf",
    "application/zip": "zip",
    "application/json": "json",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "image/gif": "gif",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "text/csv": "csv",
    "text/plain": "txt"
  };
  return normalized ? extensions[normalized] ?? "" : "";
}

export function eventResourceDownloadFileName(resource: EventResource, contentType?: string) {
  const title = resource.title.trim() || "Event resource";
  const titleExtension = fileExtension(title);
  const pathExtension = resource.storageObjectPath ? fileExtension(resource.storageObjectPath.split("/").pop() ?? "") : "";
  const extension = titleExtension || pathExtension || extensionForContentType(contentType);
  const base = safeFileName(titleExtension ? title.slice(0, -(titleExtension.length + 1)) : title);
  return extension ? `${base}.${extension}` : base;
}

export function isSecureResourceUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
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
  if (!file.name.trim() || file.size <= 0) {
    throw new Error("Choose a readable file before attaching it.");
  }
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

/** Download an attached file without navigating to the signed storage URL. */
export async function downloadEventResource(resource: EventResource) {
  if (resource.externalUrl) {
    window.open(resource.externalUrl, "_blank", "noopener,noreferrer");
    return;
  }

  const signedUrl = await getEventResourceDownloadUrl(resource);
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error("The attached file could not be downloaded.");
  const blob = await response.blob();
  if (blob.size === 0) throw new Error("The attached file is empty or unavailable.");

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = eventResourceDownloadFileName(resource, response.headers.get("content-type") ?? blob.type);
  anchor.rel = "noopener";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
