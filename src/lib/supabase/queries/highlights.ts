import type { SupabaseClient } from "@supabase/supabase-js";
import type { Highlight, HighlightInsert, HighlightUpdate } from "@/lib/supabase/types";

export async function getHighlights(
  supabase: SupabaseClient,
  bookId: string
): Promise<Highlight[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("highlights")
    .select("*")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching highlights:", error);
    return [];
  }
  return data || [];
}

export async function addHighlight(
  supabase: SupabaseClient,
  highlight: HighlightInsert
): Promise<Highlight | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("highlights")
    .insert({ ...highlight, user_id: user.id })
    .select()
    .single();

  if (error) {
    console.error("Error adding highlight:", error);
    return null;
  }
  return data;
}

export async function updateHighlight(
  supabase: SupabaseClient,
  id: string,
  updates: HighlightUpdate
): Promise<void> {
  const { error } = await supabase
    .from("highlights")
    .update(updates)
    .eq("id", id);

  if (error) {
    console.error("Error updating highlight:", error);
  }
}

export async function deleteAllHighlights(
  supabase: SupabaseClient,
  bookId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("highlights")
    .delete()
    .eq("book_id", bookId);

  if (error) {
    console.error("Error clearing highlights:", error);
    return false;
  }
  return true;
}

export async function deleteHighlight(
  supabase: SupabaseClient,
  id: string
): Promise<boolean> {
  const { error } = await supabase
    .from("highlights")
    .delete()
    .eq("id", id);

  if (error) {
    console.error("Error deleting highlight:", error);
    return false;
  }
  return true;
}
