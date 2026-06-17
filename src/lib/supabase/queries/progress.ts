import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadingProgress } from "@/lib/supabase/types";

export async function getProgress(
  supabase: SupabaseClient,
  bookId: string
): Promise<ReadingProgress | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("reading_progress")
    .select("*")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error("Error fetching progress:", error);
  }
  return data || null;
}

export async function upsertProgress(
  supabase: SupabaseClient,
  bookId: string,
  cfi: string,
  percentage: number,
  chapterLabel?: string
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("reading_progress")
    .upsert(
      {
        user_id: user.id,
        book_id: bookId,
        cfi,
        percentage,
        chapter_label: chapterLabel || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,book_id" }
    );

  if (error) {
    console.error("Error saving progress:", error);
  }

  await supabase
    .from("books")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", bookId);
}
