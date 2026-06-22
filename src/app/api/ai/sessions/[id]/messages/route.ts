import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/ai/sessions/[id]/messages
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // Messages are RLS-scoped to sessions the caller owns, so query them directly.
  // (Don't gate on a separate ownership SELECT — a failure there must not hide
  // the messages, which is what made owned sessions appear empty.)
  type Row = {
    id: string;
    role: "user" | "assistant";
    content: string;
    citations: { url: string; title: string }[] | null;
    quote?: string | null;
    book_sources?: { chapter: string; cfi: string; snippet: string }[] | null;
    created_at: string;
  };

  const first = await supabase
    .from("ai_chat_messages")
    .select("id, role, content, citations, quote, book_sources, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  let messages = first.data as Row[] | null;
  let messagesError = first.error;

  // Older DBs may lack the `quote` / `book_sources` columns — retry without them.
  if (messagesError && /quote|book_sources/i.test(messagesError.message)) {
    const retry = await supabase
      .from("ai_chat_messages")
      .select("id, role, content, citations, created_at")
      .eq("session_id", id)
      .order("created_at", { ascending: true });
    messages = retry.data as Row[] | null;
    messagesError = retry.error;
  }

  if (messagesError) {
    console.error(
      "[ai/messages GET] select failed:",
      messagesError.message,
      messagesError.code,
    );
  }

  // context_summary is best-effort: tolerate older DBs that lack the column so a
  // missing column can never turn into an empty conversation.
  let contextSummary: string | null = null;
  const { data: sess } = await supabase
    .from("ai_chat_sessions")
    .select("context_summary")
    .eq("id", id)
    .maybeSingle();
  contextSummary = sess?.context_summary ?? null;

  return NextResponse.json({
    messages: messages ?? [],
    contextSummary,
    debug: {
      count: messages?.length ?? 0,
      error: messagesError
        ? `${messagesError.message} (${messagesError.code})`
        : null,
    },
  });
}

// POST /api/ai/sessions/[id]/messages — persist a single chat turn. Done from
// the client over a normal request (not inside the streaming AI response) so the
// write always completes and survives the Cloudflare Workers response lifecycle.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    role?: "user" | "assistant";
    content?: string;
    citations?: { url: string; title: string }[];
    quote?: string;
    bookSources?: { chapter: string; cfi: string; snippet: string }[];
  };

  if (body.role !== "user" && body.role !== "assistant") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  if (!body.content || !body.content.trim()) {
    return NextResponse.json({ error: "Empty content" }, { status: 400 });
  }

  // Verify the session belongs to the caller.
  const { data: session } = await supabase
    .from("ai_chat_sessions")
    .select("id, title")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const baseRow = {
    session_id: id,
    role: body.role,
    content: body.content,
    citations: body.citations ?? [],
  };
  const row = {
    ...baseRow,
    ...(body.quote ? { quote: body.quote } : {}),
    ...(body.bookSources?.length ? { book_sources: body.bookSources } : {}),
  };

  let { data: inserted, error } = await supabase
    .from("ai_chat_messages")
    .insert(row)
    .select("id, created_at")
    .single();

  // Older DBs without the `quote`/`book_sources` columns: retry with just the
  // base row so saving still works (those extras are lost until migrated).
  if (error && /quote|book_sources/i.test(error.message)) {
    ({ data: inserted, error } = await supabase
      .from("ai_chat_messages")
      .insert(baseRow)
      .select("id, created_at")
      .single());
  }

  if (error) {
    console.error("[ai/messages POST] insert failed:", error.message, error.code);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Title the session from its first user message; otherwise just bump the time.
  const titleUpdate =
    body.role === "user" && session.title === "New chat"
      ? { title: body.content.slice(0, 60) }
      : {};
  await supabase
    .from("ai_chat_sessions")
    .update({ ...titleUpdate, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  return NextResponse.json({
    ok: true,
    id: inserted?.id,
    created_at: inserted?.created_at,
  });
}
