"use client";

import { useState } from "react";
import type { Highlight, Bookmark } from "@/lib/supabase/types";
import AiChatTab from "@/components/ai/AiChatTab";

interface ReaderSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  toc: Array<{ label: string; href: string }>;
  bookmarks: Bookmark[];
  highlights: Highlight[];
  onNavigate: (cfi: string) => void;
  onDeleteBookmark: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  onClearHighlights: () => void;
  searchResults: Array<{ cfi: string; excerpt: string }>;
  onSearch: (query: string) => void;
  bookId: string;
  bookTitle?: string;
  chapterLabel?: string;
  aiPendingText?: string | null;
  onAiPendingConsumed?: () => void;
}

const TABS = [
  { id: "toc", icon: "toc", label: "Contents" },
  { id: "bookmarks", icon: "bookmark", label: "Bookmarks" },
  { id: "highlights", icon: "ink_highlighter", label: "Highlights" },
  { id: "search", icon: "search", label: "Search" },
  { id: "ai", icon: "auto_awesome", label: "AI" },
];

export default function ReaderSidebar({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  toc,
  bookmarks,
  highlights,
  onNavigate,
  onDeleteBookmark,
  onDeleteHighlight,
  onClearHighlights,
  searchResults,
  onSearch,
  bookId,
  bookTitle,
  chapterLabel,
  aiPendingText,
  onAiPendingConsumed,
}: ReaderSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(searchQuery);
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-fade-in"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[380px] z-50 bg-[#171717]/95 backdrop-blur-2xl border-l border-white/10 transition-transform duration-300 ease-out flex flex-col ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10 flex-shrink-0">
          <h2 className="text-base font-semibold text-white">
            {TABS.find((t) => t.id === activeTab)?.label}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-sm text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200 cursor-pointer"
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10 flex-shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-all duration-200 cursor-pointer ${
                activeTab === tab.id
                  ? "text-[#3ECF8E] border-b-2 border-[#3ECF8E]"
                  : "text-white/50 hover:text-white/80"
              }`}
            >
              <span className="material-symbols-rounded sm">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "ai" ? (
          // AI tab gets flex layout to fill remaining height
          <div className="flex-1 min-h-0 flex flex-col">
            <AiChatTab
              bookId={bookId}
              bookTitle={bookTitle}
              chapterLabel={chapterLabel}
              pendingText={aiPendingText}
              onPendingConsumed={onAiPendingConsumed}
            />
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 p-4">
            {activeTab === "toc" && (
              <div className="space-y-1">
                {toc.length === 0 ? (
                  <p className="text-sm text-white/40 text-center py-8">
                    No table of contents available
                  </p>
                ) : (
                  toc.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => onNavigate(item.href)}
                      className="w-full text-left px-3 py-2.5 rounded-sm text-sm text-white/80 hover:text-white hover:bg-white/5 transition-all duration-200 cursor-pointer truncate"
                    >
                      {item.label}
                    </button>
                  ))
                )}
              </div>
            )}

            {activeTab === "bookmarks" && (
              <div className="space-y-2">
                {bookmarks.length === 0 ? (
                  <div className="text-center py-8">
                    <span className="material-symbols-rounded text-white/20 !text-[40px] mb-2 block">
                      bookmark
                    </span>
                    <p className="text-sm text-white/40">No bookmarks yet</p>
                    <p className="text-xs text-white/25 mt-1">
                      Tap the bookmark icon in the toolbar to add one
                    </p>
                  </div>
                ) : (
                  bookmarks.map((bm) => (
                    <div
                      key={bm.id}
                      className="group flex items-start gap-3 p-3 rounded-sm hover:bg-white/5 transition-all duration-200"
                    >
                      <span className="material-symbols-rounded text-[#3ECF8E] sm mt-0.5 filled">
                        bookmark
                      </span>
                      <button
                        onClick={() => onNavigate(bm.cfi)}
                        className="flex-1 text-left min-w-0 cursor-pointer"
                      >
                        {bm.text_excerpt && (
                          <p className="text-sm text-white/80 line-clamp-2">
                            {bm.text_excerpt}
                          </p>
                        )}
                        {bm.chapter_label && (
                          <p className="text-xs text-white/40 mt-1">
                            {bm.chapter_label}
                          </p>
                        )}
                      </button>
                      <button
                        onClick={() => onDeleteBookmark(bm.id)}
                        className="p-1 rounded text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer"
                      >
                        <span className="material-symbols-rounded sm">
                          delete
                        </span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "highlights" && (
              <div className="space-y-2">
                {highlights.length > 0 && (
                  <button
                    onClick={onClearHighlights}
                    className="w-full mb-1 flex items-center justify-center gap-1.5 py-2 rounded-sm text-xs text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-all duration-200 cursor-pointer"
                  >
                    <span className="material-symbols-rounded sm">
                      delete_sweep
                    </span>
                    Clear all highlights
                  </button>
                )}
                {highlights.length === 0 ? (
                  <div className="text-center py-8">
                    <span className="material-symbols-rounded text-white/20 !text-[40px] mb-2 block">
                      ink_highlighter
                    </span>
                    <p className="text-sm text-white/40">No highlights yet</p>
                    <p className="text-xs text-white/25 mt-1">
                      Select text while reading to highlight it
                    </p>
                  </div>
                ) : (
                  highlights.map((hl) => (
                    <div
                      key={hl.id}
                      className="group flex items-start gap-3 p-3 rounded-sm hover:bg-white/5 transition-all duration-200"
                    >
                      <div
                        className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                        style={{ backgroundColor: hl.color }}
                      />
                      <button
                        onClick={() => onNavigate(hl.cfi_range)}
                        className="flex-1 text-left min-w-0 cursor-pointer"
                      >
                        <p className="text-sm text-white/80 line-clamp-3">
                          &ldquo;{hl.text_content}&rdquo;
                        </p>
                        {hl.note && (
                          <p className="text-xs text-white/50 mt-1 italic">
                            {hl.note}
                          </p>
                        )}
                        {hl.chapter_label && (
                          <p className="text-xs text-white/30 mt-1">
                            {hl.chapter_label}
                          </p>
                        )}
                      </button>
                      <button
                        onClick={() => onDeleteHighlight(hl.id)}
                        className="p-1 rounded text-white/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer"
                      >
                        <span className="material-symbols-rounded sm">
                          delete
                        </span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === "search" && (
              <div>
                <form onSubmit={handleSearch} className="mb-4">
                  <div className="relative">
                    <span className="material-symbols-rounded sm absolute left-3 top-1/2 -translate-y-1/2 text-white/40">
                      search
                    </span>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search in book..."
                      className="w-full pl-9 pr-4 py-2.5 rounded-sm bg-white/5 border border-white/10 focus:border-[#3ECF8E]/50 focus:ring-1 focus:ring-[#3ECF8E]/30 outline-none text-sm text-white placeholder:text-white/30 transition-all duration-200"
                    />
                  </div>
                </form>

                {searchResults.length === 0 ? (
                  <p className="text-sm text-white/40 text-center py-8">
                    {searchQuery
                      ? "No results found"
                      : "Type to search within this book"}
                  </p>
                ) : (
                  <div className="space-y-1">
                    <p className="text-xs text-white/40 mb-2">
                      {searchResults.length} result
                      {searchResults.length !== 1 ? "s" : ""}
                    </p>
                    {searchResults.map((result, i) => (
                      <button
                        key={i}
                        onClick={() => onNavigate(result.cfi)}
                        className="w-full text-left p-3 rounded-sm text-sm text-white/70 hover:text-white hover:bg-white/5 transition-all duration-200 cursor-pointer"
                      >
                        <span
                          dangerouslySetInnerHTML={{
                            __html: result.excerpt.replace(
                              new RegExp(`(${searchQuery})`, "gi"),
                              '<mark class="bg-[#3ECF8E]/30 text-white rounded px-0.5">$1</mark>',
                            ),
                          }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
