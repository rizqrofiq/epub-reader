import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { RagChunk } from "@/lib/rag/types";

interface Body {
  bookId?: string;
  op?: "begin" | "chunks" | "finish";
  chunks?: RagChunk[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  const { bookId, op } = body;
  if (!bookId || !op) {
    return NextResponse.json({ error: "Missing bookId or op" }, { status: 400 });
  }

  const { data: book } = await supabase
    .from("books")
    .select("id")
    .eq("id", bookId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!book) {
    return NextResponse.json({ error: "Book not found" }, { status: 404 });
  }

  if (op === "begin") {
    await supabase
      .from("book_chunks")
      .delete()
      .eq("user_id", user.id)
      .eq("book_id", bookId);
    const { error } = await supabase.from("book_index").upsert(
      {
        user_id: user.id,
        book_id: bookId,
        status: "indexing",
        chunk_count: 0,
        error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,book_id" },
    );
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (op === "finish") {
    await supabase
      .from("book_index")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .eq("book_id", bookId);
    return NextResponse.json({ ok: true });
  }

  const chunks = body.chunks ?? [];
  if (!chunks.length) {
    return NextResponse.json({ error: "No chunks" }, { status: 400 });
  }

  const rows = chunks.map((c) => ({
    user_id: user.id,
    book_id: bookId,
    chunk_index: c.chunkIndex,
    chapter_label: c.chapterLabel,
    cfi: c.cfi,
    content: c.content,
  }));

  const { error: insErr } = await supabase.from("book_chunks").insert(rows);
  if (insErr) {
    await supabase
      .from("book_index")
      .update({
        status: "error",
        error: insErr.message,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("book_id", bookId);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  const { data: idx } = await supabase
    .from("book_index")
    .select("chunk_count")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .maybeSingle();
  await supabase
    .from("book_index")
    .update({
      chunk_count: (idx?.chunk_count ?? 0) + chunks.length,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.id)
    .eq("book_id", bookId);

  return NextResponse.json({ ok: true, inserted: chunks.length });
}
