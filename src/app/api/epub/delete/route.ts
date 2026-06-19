import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { presignR2Url } from "@/lib/r2/presign";
import { getR2Config, epubObjectKey } from "@/lib/r2/config";

export async function POST(request: Request) {
  const config = getR2Config();
  if (!config) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { bookId } = (await request.json().catch(() => ({}))) as {
    bookId?: string;
  };
  if (!bookId) {
    return NextResponse.json({ error: "Missing bookId" }, { status: 400 });
  }

  const { data: book } = await supabase
    .from("books")
    .select("file_hash, storage_key")
    .eq("id", bookId)
    .single();

  if (!book?.file_hash) {
    return NextResponse.json({ ok: true });
  }

  const { count } = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("file_hash", book.file_hash);

  if ((count ?? 0) > 1) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const key = book.storage_key || epubObjectKey(user.id, book.file_hash);
  const url = await presignR2Url(config, {
    method: "DELETE",
    key,
    expiresIn: 300,
    now: new Date(),
  });

  const res = await fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    return NextResponse.json(
      { error: `Failed to delete object: ${res.status}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
