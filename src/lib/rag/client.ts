// Client-side indexing orchestration: extract chunks in the browser, then ship
// them to the server in batches to be embedded + stored. Lazy — called the
// first time the user opens the AI assistant for a book.

import type { IndexStatus, RagChunk } from "./types";

const BATCH = 96;

export async function getIndexStatus(bookId: string): Promise<IndexStatus> {
  try {
    const res = await fetch(`/api/rag/status?bookId=${encodeURIComponent(bookId)}`);
    if (!res.ok) return { status: "none", chunkCount: 0 };
    return (await res.json()) as IndexStatus;
  } catch {
    return { status: "none", chunkCount: 0 };
  }
}

async function post(body: unknown): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch("/api/rag/index", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.ok) return { ok: true };
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  return { ok: false, error: json.error || `Indexing failed (${res.status})` };
}

export interface IndexResult {
  ok: boolean;
  error?: string;
  skipped?: boolean;
}

export async function ensureBookIndexed(
  bookId: string,
  getChunks: () => Promise<RagChunk[]>,
  onProgress?: (pct: number) => void,
): Promise<IndexResult> {
  const status = await getIndexStatus(bookId);
  if (status.status === "ready") return { ok: true, skipped: true };

  onProgress?.(0);
  const chunks = await getChunks();
  if (!chunks.length) return { ok: false, error: "No readable text found in this book" };

  const begin = await post({ bookId, op: "begin" });
  if (!begin.ok) return { ok: false, error: begin.error };

  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const res = await post({ bookId, op: "chunks", chunks: slice });
    if (!res.ok) return { ok: false, error: res.error };
    onProgress?.(Math.round(((i + slice.length) / chunks.length) * 100));
  }

  const finish = await post({ bookId, op: "finish" });
  if (!finish.ok) return { ok: false, error: finish.error };

  onProgress?.(100);
  return { ok: true };
}
