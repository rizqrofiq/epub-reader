"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { getUserBooks, getBookCovers } from "@/lib/supabase/queries/books";
import { getReadingStats } from "@/lib/supabase/queries/history";
import { useLibraryStore } from "@/stores/library-store";
import type { Book, ReadingStats } from "@/lib/supabase/types";
import BookCard from "@/components/library/BookCard";
import UploadModal from "@/components/library/UploadModal";
import DrivePickerModal from "@/components/library/DrivePickerModal";

export default function DashboardPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  const {
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    isUploadModalOpen,
    setUploadModalOpen,
    isDrivePickerOpen,
    setDrivePickerOpen,
  } = useLibraryStore();

  const supabase = useMemo(() => createClient(), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.href = "/auth";
        return;
      }

      setUserName(
        user.user_metadata?.full_name ||
          user.email?.split("@")[0] ||
          "Reader"
      );

      const [booksData, statsData] = await Promise.all([
        getUserBooks(supabase, user.id),
        getReadingStats(supabase, user.id),
      ]);
      setBooks(booksData);
      setStats(statsData);

      getBookCovers(supabase, user.id)
        .then((covers) => {
          setBooks((prev) =>
            prev.map((b) => ({ ...b, cover_url: covers[b.id] ?? null }))
          );
        })
        .catch((err) => console.error("Failed to load covers:", err));
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  };

  const filteredBooks = books.filter((book) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      book.title.toLowerCase().includes(q) ||
      (book.author && book.author.toLowerCase().includes(q))
    );
  });

  const continueReading = books
    .filter(
      (b: Book & { reading_progress?: { percentage: number }[] }) =>
        b.reading_progress &&
        Array.isArray(b.reading_progress) &&
        b.reading_progress.length > 0 &&
        b.reading_progress[0].percentage > 0 &&
        b.reading_progress[0].percentage < 0.95
    )
    .slice(0, 4);

  const formatTime = (seconds: number) => {
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  };

  return (
    <div className="min-h-screen bg-bg-primary">
      <header className="sticky top-0 z-40 glass border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-accent/15 border border-accent/20 flex items-center justify-center">
              <span className="material-symbols-rounded text-accent !text-[20px]">
                auto_stories
              </span>
            </div>
            <span className="text-lg font-semibold text-text-primary">
              Readium
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-text-secondary hidden sm:block">
              {userName}
            </span>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all duration-200 cursor-pointer"
            >
              <span className="material-symbols-rounded sm">logout</span>
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 animate-slide-up">
          <h1 className="text-3xl font-bold text-text-primary mb-2">
            Good {new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"},{" "}
            {userName}
          </h1>
          <p className="text-text-secondary">
            Pick up where you left off, or discover something new.
          </p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10 animate-slide-up [animation-delay:100ms]">
            {[
              {
                icon: "library_books",
                label: "Books",
                value: stats.total_books,
              },
              {
                icon: "schedule",
                label: "Reading Time",
                value: formatTime(stats.total_reading_time),
              },
              {
                icon: "done_all",
                label: "Completed",
                value: stats.books_completed,
              },
              {
                icon: "local_fire_department",
                label: "Streak",
                value: `${stats.current_streak}d`,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="p-4 rounded-md bg-bg-secondary border border-border hover:border-border-hover transition-all duration-200"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-rounded sm text-accent">
                    {stat.icon}
                  </span>
                  <span className="text-xs text-text-tertiary uppercase tracking-wider">
                    {stat.label}
                  </span>
                </div>
                <span className="text-2xl font-bold text-text-primary">
                  {stat.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {continueReading.length > 0 && (
          <section className="mb-10 animate-slide-up [animation-delay:200ms]">
            <h2 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
              <span className="material-symbols-rounded text-accent">
                play_circle
              </span>
              Continue Reading
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {continueReading.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  onDelete={() => loadData()}
                  compact
                />
              ))}
            </div>
          </section>
        )}

        <div className="flex items-center justify-between mb-6 animate-slide-up [animation-delay:300ms]">
          <h2 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <span className="material-symbols-rounded text-accent">
              library_books
            </span>
            Your Library
          </h2>
          <div className="flex items-center gap-3">
            <div className="relative h-10">
              <span className="material-symbols-rounded sm absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary">
                search
              </span>
              <input
                type="text"
                placeholder="Search books..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-full pl-9 pr-4 rounded-md bg-bg-elevated border border-border focus:border-accent focus:ring-1 focus:ring-accent/50 outline-none text-sm text-text-primary placeholder:text-text-tertiary w-48 transition-all duration-200"
              />
            </div>

            <div className="flex h-10 rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={`flex items-center justify-center w-10 h-full transition-all duration-200 cursor-pointer ${
                  viewMode === "grid"
                    ? "bg-accent/15 text-accent"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated"
                }`}
              >
                <span className="material-symbols-rounded sm">grid_view</span>
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={`flex items-center justify-center w-10 h-full transition-all duration-200 cursor-pointer border-l border-border/50 ${
                  viewMode === "list"
                    ? "bg-accent/15 text-accent"
                    : "text-text-tertiary hover:text-text-secondary hover:bg-bg-elevated"
                }`}
              >
                <span className="material-symbols-rounded sm">
                  view_list
                </span>
              </button>
            </div>

            <button
              onClick={() => setDrivePickerOpen(true)}
              className="flex items-center gap-1.5 px-4 h-10 rounded-md border border-border text-sm text-text-secondary hover:text-text-primary hover:border-border-hover transition-all duration-200 cursor-pointer"
            >
              <span className="material-symbols-rounded sm">add_to_drive</span>
              <span className="hidden sm:inline">Drive</span>
            </button>

            <button
              onClick={() => setUploadModalOpen(true)}
              className="flex items-center gap-1.5 px-4 h-10 rounded-md bg-accent hover:bg-accent-hover text-bg-primary text-sm font-medium transition-all duration-200 cursor-pointer"
            >
              <span className="material-symbols-rounded sm">upload_file</span>
              Upload
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="material-symbols-rounded text-accent animate-spin !text-[32px]">
              progress_activity
            </span>
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
            <div className="w-20 h-20 rounded-md bg-bg-elevated border border-border flex items-center justify-center mb-4">
              <span className="material-symbols-rounded text-text-tertiary !text-[36px]">
                menu_book
              </span>
            </div>
            <h3 className="text-lg font-medium text-text-primary mb-1">
              {searchQuery ? "No books found" : "Your library is empty"}
            </h3>
            <p className="text-text-secondary text-sm mb-6">
              {searchQuery
                ? "Try a different search term"
                : "Upload an EPUB or import from Google Drive to get started"}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setUploadModalOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-md bg-accent hover:bg-accent-hover text-bg-primary font-medium transition-all duration-200 cursor-pointer"
              >
                <span className="material-symbols-rounded sm">
                  upload_file
                </span>
                Upload your first book
              </button>
            )}
          </div>
        ) : (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5"
                : "flex flex-col gap-3"
            }
          >
            {filteredBooks.map((book, i) => (
              <div
                key={book.id}
                className="animate-slide-up"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <BookCard
                  book={book}
                  onDelete={() => loadData()}
                  listMode={viewMode === "list"}
                />
              </div>
            ))}
          </div>
        )}
      </main>

      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onSuccess={() => {
          setUploadModalOpen(false);
          loadData();
        }}
      />
      <DrivePickerModal
        isOpen={isDrivePickerOpen}
        onClose={() => setDrivePickerOpen(false)}
        onSuccess={() => {
          setDrivePickerOpen(false);
          loadData();
        }}
      />
    </div>
  );
}
