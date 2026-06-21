"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateBookCategorization } from "@/lib/supabase/queries/books";
import type { Book } from "@/lib/supabase/types";

interface CategorizeModalProps {
  book: Book | null;
  shelfSuggestions: string[];
  tagSuggestions: string[];
  onClose: () => void;
  onSaved: (bookId: string, shelf: string | null, tags: string[]) => void;
}

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export default function CategorizeModal({
  book,
  shelfSuggestions,
  tagSuggestions,
  onClose,
  onSaved,
}: CategorizeModalProps) {
  const supabase = useMemo(() => createClient(), []);
  const [shelf, setShelf] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (book) {
      setShelf(book.shelf || "");
      setTags(book.tags || []);
      setTagInput("");
    }
  }, [book]);

  const addTag = useCallback((raw: string) => {
    const t = normalize(raw);
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
    setTagInput("");
  }, []);

  const removeTag = useCallback((t: string) => {
    setTags((prev) => prev.filter((x) => x !== t));
  }, []);

  if (!book) return null;

  const unusedTagSuggestions = tagSuggestions.filter((t) => !tags.includes(t));

  const handleSave = async () => {
    setSaving(true);
    const cleanShelf = normalize(shelf) || null;
    const ok = await updateBookCategorization(supabase, book.id, {
      shelf: cleanShelf,
      tags,
    });
    setSaving(false);
    if (ok) {
      onSaved(book.id, cleanShelf, tags);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md bg-bg-secondary border border-border rounded-sm shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between p-5 pb-0">
          <h2 className="text-base font-semibold text-text-primary flex items-center gap-2">
            <span className="material-symbols-rounded sm text-accent">
              sell
            </span>
            Categorize
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-sm text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-all duration-200 cursor-pointer"
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        <div className="p-5 space-y-5">
          <p className="text-sm text-text-secondary truncate">{book.title}</p>

          {/* Shelf */}
          <div className="space-y-2">
            <label className="text-xs text-text-tertiary uppercase tracking-wider">
              Shelf
            </label>
            <input
              list="shelf-suggestions"
              value={shelf}
              onChange={(e) => setShelf(e.target.value)}
              placeholder="e.g. Currently Reading"
              className="w-full rounded-sm bg-bg-elevated border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
            />
            <datalist id="shelf-suggestions">
              {shelfSuggestions.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <label className="text-xs text-text-tertiary uppercase tracking-wider">
              Tags
            </label>

            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full bg-accent/15 border border-accent/20 text-accent text-xs"
                  >
                    {t}
                    <button
                      onClick={() => removeTag(t)}
                      className="hover:bg-accent/20 rounded-full p-0.5 cursor-pointer"
                    >
                      <span className="material-symbols-rounded !text-[14px]">
                        close
                      </span>
                    </button>
                  </span>
                ))}
              </div>
            )}

            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addTag(tagInput);
                } else if (e.key === "Backspace" && !tagInput && tags.length) {
                  removeTag(tags[tags.length - 1]);
                }
              }}
              placeholder="Type a tag and press Enter"
              className="w-full rounded-sm bg-bg-elevated border border-border px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary outline-none focus:border-accent transition-colors"
            />

            {unusedTagSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {unusedTagSuggestions.slice(0, 12).map((t) => (
                  <button
                    key={t}
                    onClick={() => addTag(t)}
                    className="px-2.5 py-1 rounded-full bg-bg-elevated border border-border text-text-secondary text-xs hover:border-accent/40 hover:text-text-primary transition-all duration-200 cursor-pointer"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-5 pt-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-sm text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all duration-200 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-sm bg-accent hover:bg-accent-hover text-bg-primary text-sm font-medium transition-all duration-200 cursor-pointer disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
