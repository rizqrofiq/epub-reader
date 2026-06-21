import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/ai/sessions?bookId=...  → list sessions for a book, newest first
// POST /api/ai/sessions             → create a new session
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const bookId = new URL(request.url).searchParams.get("bookId");
  if (!bookId) return NextResponse.json({ error: "Missing bookId" }, { status: 400 });

  const { data, error } = await supabase
    .from("ai_chat_sessions")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessions: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { bookId } = (await request.json().catch(() => ({}))) as { bookId?: string };
  if (!bookId) return NextResponse.json({ error: "Missing bookId" }, { status: 400 });

  const { data, error } = await supabase
    .from("ai_chat_sessions")
    .insert({ user_id: user.id, book_id: bookId, title: "New chat" })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ sessionId: data.id });
}
