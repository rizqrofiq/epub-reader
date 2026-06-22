// Server-only RAG retrieval. Book grounding uses Postgres full-text search (no
// embeddings) exposed to the model as a `search_book` tool — see the ask route.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface BookPassage {
  chapter: string;
  cfi: string;
  content: string;
}

const DEFAULT_COUNT = 6;

export async function isBookIndexed(
  supabase: SupabaseClient,
  userId: string,
  bookId: string | null,
): Promise<boolean> {
  if (!bookId) return false;
  const { data } = await supabase
    .from("book_index")
    .select("status")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .maybeSingle();
  return data?.status === "ready";
}

export async function searchBookChunks(
  supabase: SupabaseClient,
  userId: string,
  bookId: string,
  query: string,
  count = DEFAULT_COUNT,
): Promise<BookPassage[]> {
  if (!bookId || !query.trim()) return [];

  const { data, error } = await supabase.rpc("search_book_chunks", {
    p_book_id: bookId,
    p_query: query,
    p_count: count,
  });
  if (error) {
    console.error("[rag/search] failed:", error.message, error.code);
    throw new Error(error.message);
  }

  const rows = (data ?? []) as {
    chapter_label: string | null;
    cfi: string | null;
    content: string;
    rank: number;
  }[];

  return rows.map((r) => ({
    chapter: r.chapter_label || "Book",
    cfi: r.cfi || "",
    content: r.content,
  }));
}
