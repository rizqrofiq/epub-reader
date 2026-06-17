import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bookmark, BookmarkInsert } from "@/lib/supabase/types";

export async function getBookmarks(
  supabase: SupabaseClient,
  bookId: string
): Promise<Bookmark[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching bookmarks:", error);
    return [];
  }
  return data || [];
}

export async function addBookmark(
  supabase: SupabaseClient,
  bookmark: BookmarkInsert
): Promise<Bookmark | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("bookmarks")
    .insert({ ...bookmark, user_id: user.id })
    .select()
    .single();

  if (error) {
    console.error("Error adding bookmark:", error);
    return null;
  }
  return data;
}

export async function deleteBookmark(
  supabase: SupabaseClient,
  id: string
): Promise<boolean> {
  const { error } = await supabase
    .from("bookmarks")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting bookmark:", error);
    return false;
  }
  return true;
}

export async function toggleBookmark(
  supabase: SupabaseClient,
  bookId: string,
  cfi: string,
  textExcerpt?: string,
  chapterLabel?: string
): Promise<{ added: boolean; bookmark: Bookmark | null }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { added: false, bookmark: null };

  const { data: existing } = await supabase
    .from("bookmarks")
    .select("*")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .eq("cfi", cfi)
    .maybeSingle();

  if (existing) {
    await deleteBookmark(supabase, existing.id);
    return { added: false, bookmark: null };
  }

  const bookmark = await addBookmark(supabase, {
    book_id: bookId,
    cfi,
    text_excerpt: textExcerpt,
    chapter_label: chapterLabel,
  });

  return { added: true, bookmark };
}
