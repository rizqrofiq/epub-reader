import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// DELETE /api/ai/sessions/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;

  // Verify ownership before deleting
  const { data: session } = await supabase
    .from("ai_chat_sessions")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!session) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase.from("ai_chat_sessions").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
