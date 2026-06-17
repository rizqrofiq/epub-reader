import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadHistoryWithBook, ReadingStats } from "@/lib/supabase/types";

export async function startSession(
  supabase: SupabaseClient,
  bookId: string
): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("read_history")
    .insert({
      user_id: user.id,
      book_id: bookId,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error starting session:", error);
    return null;
  }
  return data.id;
}

export async function endSession(
  supabase: SupabaseClient,
  sessionId: string,
  durationSeconds: number,
  pagesRead: number
): Promise<void> {
  const { error } = await supabase
    .from("read_history")
    .update({
      ended_at: new Date().toISOString(),
      duration_seconds: durationSeconds,
      pages_read: pagesRead,
    })
    .eq("id", sessionId);

  if (error) {
    console.error("Error ending session:", error);
  }
}

export async function getReadHistory(
  supabase: SupabaseClient,
  limit: number = 20
): Promise<ReadHistoryWithBook[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("read_history")
    .select("*, books(title, author, cover_url)")
    .eq("user_id", user.id)
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Error fetching read history:", error);
    return [];
  }
  return data || [];
}

export async function getReadingStats(
  supabase: SupabaseClient,
  userId?: string
): Promise<ReadingStats> {
  let uid = userId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid)
    return { total_books: 0, total_reading_time: 0, books_completed: 0, current_streak: 0 };

  const [
    { count: totalBooks },
    { data: historyData },
    { count: booksCompleted }
  ] = await Promise.all([
    supabase.from("books").select("*", { count: "exact", head: true }).eq("user_id", uid),
    supabase.from("read_history").select("duration_seconds").eq("user_id", uid),
    supabase.from("reading_progress").select("*", { count: "exact", head: true }).eq("user_id", uid).gte("percentage", 0.95)
  ]);

  const totalReadingTime = (historyData || []).reduce(
    (sum, h) => sum + (h.duration_seconds || 0),
    0
  );

  return {
    total_books: totalBooks || 0,
    total_reading_time: totalReadingTime,
    books_completed: booksCompleted || 0,
    current_streak: 0,
  };
}
