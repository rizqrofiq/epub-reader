import type { SupabaseClient } from "@supabase/supabase-js";
import { addOutbox, listOutbox, removeOutbox } from "@/lib/epub-cache";

export type OutboxOp =
  | "progress.upsert"
  | "highlight.add"
  | "highlight.delete"
  | "bookmark.add"
  | "bookmark.delete";

type Handler = (
  supabase: SupabaseClient,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
) => Promise<void>;

async function requireUserId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user.id;
}

const HANDLERS: Record<OutboxOp, Handler> = {
  "progress.upsert": async (supabase, p) => {
    const userId = await requireUserId(supabase);
    const { error } = await supabase.from("reading_progress").upsert(
      {
        user_id: userId,
        book_id: p.bookId,
        cfi: p.cfi,
        percentage: p.percentage,
        chapter_label: p.chapterLabel || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,book_id" },
    );
    if (error) throw error;
    await supabase
      .from("books")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", p.bookId);
  },
  "highlight.add": async (supabase, p) => {
    const userId = await requireUserId(supabase);
    const { error } = await supabase.from("highlights").upsert(
      {
        id: p.id,
        user_id: userId,
        book_id: p.book_id,
        cfi_range: p.cfi_range,
        text_content: p.text_content,
        color: p.color ?? "#3ECF8E",
        note: p.note ?? null,
        chapter_label: p.chapter_label ?? null,
      },
      { onConflict: "id" },
    );
    if (error) throw error;
  },
  "highlight.delete": async (supabase, p) => {
    const { error } = await supabase.from("highlights").delete().eq("id", p.id);
    if (error) throw error;
  },
  "bookmark.add": async (supabase, p) => {
    const userId = await requireUserId(supabase);
    const { error } = await supabase.from("bookmarks").upsert(
      {
        id: p.id,
        user_id: userId,
        book_id: p.book_id,
        cfi: p.cfi,
        text_excerpt: p.text_excerpt ?? null,
        chapter_label: p.chapter_label ?? null,
      },
      { onConflict: "id" },
    );
    if (error) throw error;
  },
  "bookmark.delete": async (supabase, p) => {
    const { error } = await supabase.from("bookmarks").delete().eq("id", p.id);
    if (error) throw error;
  },
};

function isOffline(): boolean {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

async function collapseProgress(bookId: string) {
  const items = await listOutbox();
  for (const it of items) {
    if (
      it.op === "progress.upsert" &&
      it.id != null &&
      (it.payload as { bookId?: string }).bookId === bookId
    ) {
      await removeOutbox(it.id);
    }
  }
}

async function cancelPendingAdd(addOp: OutboxOp, id: string): Promise<boolean> {
  const items = await listOutbox();
  const pendingAdd = items.find(
    (it) => it.op === addOp && (it.payload as { id?: string }).id === id,
  );
  if (pendingAdd?.id != null) {
    await removeOutbox(pendingAdd.id);
    return true;
  }
  return false;
}

export async function runOrQueue(
  supabase: SupabaseClient,
  op: OutboxOp,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
): Promise<void> {
  if (op === "progress.upsert" && payload?.bookId) {
    await collapseProgress(payload.bookId);
  }

  if (
    op === "highlight.delete" &&
    (await cancelPendingAdd("highlight.add", payload.id))
  ) {
    return;
  }
  if (
    op === "bookmark.delete" &&
    (await cancelPendingAdd("bookmark.add", payload.id))
  ) {
    return;
  }

  if (!isOffline()) {
    try {
      await HANDLERS[op](supabase, payload);
      return;
    } catch {
      // fall through to enqueue
    }
  }
  await addOutbox(op, payload);
}

let flushing = false;

export async function flushOutbox(supabase: SupabaseClient): Promise<void> {
  if (flushing || isOffline()) return;
  flushing = true;
  try {
    const items = await listOutbox();
    if (!items.length) return;

    const {
      data: { user },
    } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
    if (!user) return;

    for (const it of items) {
      try {
        await HANDLERS[it.op as OutboxOp](supabase, it.payload);
        if (it.id != null) await removeOutbox(it.id);
      } catch {
        break;
      }
    }
  } finally {
    flushing = false;
  }
}
