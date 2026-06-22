"use client";

import { useState } from "react";
import type { BookSource } from "@/lib/ai/provider";

// Collapsible "From this book" grounding sources. Collapsed by default so a
// grounded answer with many excerpts doesn't dominate the panel; the header
// shows the count and a chevron, and each row jumps to the passage.
export default function BookSources({
  sources,
  onJumpToSource,
}: {
  sources: BookSource[];
  onJumpToSource?: (cfi: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 pt-3 border-t border-white/8">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1 text-[10px] uppercase tracking-widest text-white/30 font-medium hover:text-white/50 transition-colors cursor-pointer"
      >
        <span
          className={`material-symbols-rounded !text-[14px] transition-transform duration-200 ${
            open ? "rotate-90" : ""
          }`}
        >
          chevron_right
        </span>
        From this book · {sources.length}
      </button>

      {open && (
        <div className="mt-1.5 space-y-1.5">
          {sources.map((s, i) => {
            const canJump = !!(onJumpToSource && s.cfi);
            return (
              <button
                key={`${s.cfi}-${i}`}
                type="button"
                disabled={!canJump}
                onClick={() => canJump && onJumpToSource!(s.cfi)}
                title={canJump ? "Jump to this passage" : undefined}
                className={`flex w-full items-start gap-2 text-left rounded-sm -mx-1 px-1 py-0.5 ${
                  canJump
                    ? "cursor-pointer hover:bg-white/5 group"
                    : "cursor-default"
                }`}
              >
                <span className="material-symbols-rounded !text-[13px] text-[#3ECF8E]/60 mt-0.5 flex-shrink-0">
                  menu_book
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-xs text-white/50 truncate ${
                      canJump ? "group-hover:text-[#3ECF8E]" : ""
                    }`}
                  >
                    {s.chapter}
                  </span>
                  <span className="block text-[11px] text-white/30 line-clamp-2 leading-relaxed">
                    {s.snippet}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
