import type { SupabaseClient } from "@supabase/supabase-js";
import { deleteBook } from "@/lib/supabase/queries/books";
import { deleteEpub, deleteCachedCover } from "@/lib/epub-cache";

export class QuotaError extends Error {}

export async function removeBook(
  supabase: SupabaseClient,
  bookId: string,
  fileHash: string,
): Promise<boolean> {
  await deleteEpubFromCloud(bookId);
  const ok = await deleteBook(supabase, bookId);
  await deleteEpub(fileHash);
  await deleteCachedCover(bookId);
  return ok;
}

export async function uploadEpubToCloud(
  fileHash: string,
  data: ArrayBuffer,
): Promise<string | null> {
  const res = await fetch("/api/epub/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileHash, fileSize: data.byteLength }),
  });

  if (res.status === 503) return null;
  if (res.status === 403) {
    const { error } = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new QuotaError(error || "Storage quota exceeded");
  }
  if (!res.ok) throw new Error(`Failed to get upload URL: ${res.status}`);

  const { url, storageKey } = (await res.json()) as {
    url: string;
    storageKey: string;
  };

  const put = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": "application/epub+zip" },
    body: data,
  });
  if (!put.ok) throw new Error(`Failed to upload to storage: ${put.status}`);

  return storageKey;
}

export async function deleteEpubFromCloud(bookId: string): Promise<void> {
  try {
    await fetch("/api/epub/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookId }),
    });
  } catch (err) {
    console.warn("Cloud delete failed:", err);
  }
}

export async function downloadEpubFromCloud(
  fileHash: string,
): Promise<ArrayBuffer | null> {
  const res = await fetch(
    `/api/epub/download-url?fileHash=${encodeURIComponent(fileHash)}`,
  );
  if (res.status === 503) return null;
  if (!res.ok) throw new Error(`Failed to get download URL: ${res.status}`);

  const { url } = (await res.json()) as { url: string };

  const obj = await fetch(url);
  if (obj.status === 404) return null;
  if (!obj.ok)
    throw new Error(`Failed to download from storage: ${obj.status}`);

  return obj.arrayBuffer();
}
