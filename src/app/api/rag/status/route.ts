import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const bookId = new URL(request.url).searchParams.get("bookId");
  if (!bookId) {
    return NextResponse.json({ error: "Missing bookId" }, { status: 400 });
  }

  const { data } = await supabase
    .from("book_index")
    .select("status, chunk_count")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .maybeSingle();

  return NextResponse.json({
    status: data?.status ?? "none",
    chunkCount: data?.chunk_count ?? 0,
  });
}
