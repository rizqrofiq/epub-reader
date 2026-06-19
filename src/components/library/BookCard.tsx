"use client";

import { useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { removeBook } from "@/lib/epub-cloud";
import type { Book } from "@/lib/supabase/types";

interface BookCardProps {
  book: Book & {
    reading_progress?: { percentage: number; chapter_label?: string }[];
  };
  onDelete: () => void;
  onCategorize?: (book: Book) => void;
  compact?: boolean;
  listMode?: boolean;
}

export default function BookCard({
  book,
  onDelete,
  onCategorize,
  compact = false,
  listMode = false,
}: BookCardProps) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const supabase = useMemo(() => createClient(), []);

  const progress =
    book.reading_progress && book.reading_progress.length > 0
      ? book.reading_progress[0]
      : null;
  const percentage = progress ? Math.round(progress.percentage * 100) : 0;

  const handleOpen = () => {
    router.push(`/read/${book.id}`);
  };

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Remove this book from your library?")) return;
    setDeleting(true);
    await removeBook(supabase, book.id, book.file_hash);
    onDelete();
  };

  if (listMode) {
    return (
      <div
        onClick={handleOpen}
        className="group flex items-center gap-4 p-3 rounded-md bg-bg-secondary border border-border hover:border-accent/30 hover:bg-surface-hover transition-all duration-200 cursor-pointer"
      >
        <div className="w-12 h-16 rounded-md bg-bg-elevated border border-border flex-shrink-0 overflow-hidden flex items-center justify-center">
          {book.cover_url ? (
            <img
              src={book.cover_url}
              alt={book.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <span className="material-symbols-rounded text-text-tertiary sm">
              menu_book
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-text-primary truncate">
            {book.title}
          </h3>
          <p className="text-xs text-text-secondary truncate">
            {book.author || "Unknown Author"}
          </p>
          {(book.shelf || (book.tags && book.tags.length > 0)) && (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {book.shelf && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-elevated border border-border text-text-secondary text-[10px]">
                  <span className="material-symbols-rounded !text-[12px]">
                    shelves
                  </span>
                  {book.shelf}
                </span>
              )}
              {book.tags?.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px]"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        {percentage > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-24 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
              <div
                className="h-full rounded-full bg-accent transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-xs text-text-tertiary w-8">
              {percentage}%
            </span>
          </div>
        )}

        {onCategorize && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCategorize(book);
            }}
            className="p-1.5 rounded-md text-text-tertiary hover:text-accent hover:bg-accent/10 transition-all duration-200 opacity-0 group-hover:opacity-100 cursor-pointer"
          >
            <span className="material-symbols-rounded sm">sell</span>
          </button>
        )}
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-1.5 rounded-md text-text-tertiary hover:text-destructive hover:bg-destructive/10 transition-all duration-200 opacity-0 group-hover:opacity-100 cursor-pointer"
        >
          <span className="material-symbols-rounded sm">delete</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className="group relative cursor-pointer"
      onClick={handleOpen}
      onMouseLeave={() => setShowMenu(false)}
    >
      <div
        className={`relative overflow-hidden rounded-md bg-bg-secondary border border-border group-hover:border-accent/30 transition-all duration-300 group-hover:shadow-lg group-hover:shadow-accent/5 group-hover:-translate-y-1 ${
          compact ? "aspect-[3/4]" : "aspect-[2/3]"
        }`}
      >
        {book.cover_url ? (
          <img
            src={book.cover_url}
            alt={book.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 bg-gradient-to-br from-bg-secondary to-bg-elevated">
            <span className="material-symbols-rounded text-text-tertiary !text-[36px]">
              menu_book
            </span>
            <span className="text-xs text-text-tertiary text-center line-clamp-2">
              {book.title}
            </span>
          </div>
        )}

        {percentage > 0 && (
          <div className="absolute bottom-0 left-0 right-0">
            <div className="h-1 bg-black/40">
              <div
                className="h-full bg-accent transition-all duration-500"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-rounded text-white filled sm">
              play_circle
            </span>
            <span className="text-xs text-white font-medium">
              {percentage > 0 ? "Continue" : "Start Reading"}
            </span>
          </div>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="absolute top-2 right-2 p-1 rounded-md bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-black/60 cursor-pointer"
        >
          <span className="material-symbols-rounded sm">more_vert</span>
        </button>

        {showMenu && (
          <div
            className="absolute top-10 right-2 w-36 bg-bg-elevated border border-border rounded-md shadow-xl z-10 animate-scale-in overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleOpen}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
            >
              <span className="material-symbols-rounded sm">menu_book</span>
              Read
            </button>
            {onCategorize && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onCategorize(book);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-primary hover:bg-surface-hover transition-colors cursor-pointer"
              >
                <span className="material-symbols-rounded sm">sell</span>
                Categorize
              </button>
            )}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            >
              <span className="material-symbols-rounded sm">delete</span>
              {deleting ? "Removing..." : "Remove"}
            </button>
          </div>
        )}
      </div>

      {!compact && (
        <div className="mt-2.5 px-0.5">
          <h3 className="text-sm font-medium text-text-primary truncate">
            {book.title}
          </h3>
          <p className="text-xs text-text-secondary truncate mt-0.5">
            {book.author || "Unknown Author"}
          </p>
          {(book.shelf || (book.tags && book.tags.length > 0)) && (
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              {book.shelf && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-elevated border border-border text-text-secondary text-[10px]">
                  <span className="material-symbols-rounded !text-[12px]">
                    shelves
                  </span>
                  {book.shelf}
                </span>
              )}
              {book.tags?.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-[10px]"
                >
                  {t}
                </span>
              ))}
              {book.tags && book.tags.length > 2 && (
                <span className="text-[10px] text-text-tertiary">
                  +{book.tags.length - 2}
                </span>
              )}
            </div>
          )}
          {percentage > 0 && (
            <span className="text-xs text-accent mt-1 inline-block">
              {percentage}%
            </span>
          )}
        </div>
      )}

      {compact && (
        <div className="mt-2 px-0.5">
          <h3 className="text-sm font-medium text-text-primary truncate">
            {book.title}
          </h3>
          {progress?.chapter_label && (
            <p className="text-xs text-text-tertiary truncate mt-0.5">
              {progress.chapter_label}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
