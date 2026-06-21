import type { SupabaseClient } from "@supabase/supabase-js";
import type { Book, BookInsert } from "@/lib/supabase/types";

const BOOK_LIST_COLUMNS =
  "id,user_id,title,author,file_hash,source,format,drive_file_id,storage_key,shelf,tags,file_size,metadata,created_at,updated_at,reading_progress(percentage,chapter_label)";

export async function getUserBooks(
  supabase: SupabaseClient,
  userId?: string
): Promise<Book[]> {
  let uid = userId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return [];

  const { data, error } = await supabase
    .from("books")
    .select(BOOK_LIST_COLUMNS)
    .eq("user_id", uid)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("Error fetching books:", error);
    return [];
  }
  return (data as unknown as Book[]) || [];
}

export async function getBookCovers(
  supabase: SupabaseClient,
  userId?: string
): Promise<Record<string, string | null>> {
  let uid = userId;
  if (!uid) {
    const { data: { user } } = await supabase.auth.getUser();
    uid = user?.id;
  }
  if (!uid) return {};

  const { data, error } = await supabase
    .from("books")
    .select("id, cover_url")
    .eq("user_id", uid);

  if (error) {
    console.error("Error fetching covers:", error);
    return {};
  }

  const covers: Record<string, string | null> = {};
  for (const row of data || []) {
    covers[row.id] = row.cover_url;
  }
  return covers;
}

export async function addBook(
  supabase: SupabaseClient,
  book: BookInsert
): Promise<Book | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("books")
    .upsert(
      { ...book, user_id: user.id },
      { onConflict: "user_id,file_hash" }
    )
    .select()
    .single();

  if (error) {
    console.error("Error adding book:", error);
    return null;
  }
  return data;
}

export async function getBook(
  supabase: SupabaseClient,
  bookId: string
): Promise<Book | null> {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("id", bookId)
    .single();

  if (error) {
    console.error("Error fetching book:", error);
    return null;
  }
  return data;
}

export async function updateBookCategorization(
  supabase: SupabaseClient,
  bookId: string,
  categorization: { shelf?: string | null; tags?: string[] }
): Promise<boolean> {
  const { error } = await supabase
    .from("books")
    .update(categorization)
    .eq("id", bookId);

  if (error) {
    console.error("Error updating categorization:", error);
    return false;
  }
  return true;
}

export async function updateBookStorageKey(
  supabase: SupabaseClient,
  bookId: string,
  storageKey: string
): Promise<void> {
  const { error } = await supabase
    .from("books")
    .update({ storage_key: storageKey })
    .eq("id", bookId);
  if (error) console.error("Error updating storage_key:", error);
}

export async function deleteBook(
  supabase: SupabaseClient,
  bookId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("books")
    .delete()
    .eq("id", bookId);

  if (error) {
    console.error("Error deleting book:", error);
    return false;
  }
  return true;
}
