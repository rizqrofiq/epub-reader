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

  // Verify ownership
  const { data: session } = await supabase
    .from("ai_chat_sessions")
    .select("id, context_summary")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: messages, error: messagesError } = await supabase
    .from("ai_chat_messages")
    .select("id, role, content, citations, created_at")
    .eq("session_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({
    messages: messages ?? [],
    contextSummary: session.context_summary ?? null,
    // Diagnostic: surfaces RLS/select failures instead of silently returning [].
    debug: {
      count: messages?.length ?? 0,
      error: messagesError
        ? `${messagesError.message} (${messagesError.code})`
        : null,
    },
  });
}
