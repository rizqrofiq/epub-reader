"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getBook } from "@/lib/supabase/queries/books";
import { getProgress, upsertProgress } from "@/lib/supabase/queries/progress";
import {
  getHighlights,
  addHighlight,
  deleteHighlight,
} from "@/lib/supabase/queries/highlights";
import {
  getBookmarks,
  toggleBookmark,
  deleteBookmark as removeBookmark,
} from "@/lib/supabase/queries/bookmarks";
import { startSession, endSession } from "@/lib/supabase/queries/history";
import {
  getEpubWithLocations,
  saveEpubLocations,
  storeEpubFromBuffer,
} from "@/lib/epub-cache";
import { downloadEpubFromCloud } from "@/lib/epub-cloud";
import { useReaderStore } from "@/stores/reader-store";
import type { Book, Highlight, Bookmark } from "@/lib/supabase/types";
import ReaderView from "@/components/reader/ReaderView";
import ReaderToolbar from "@/components/reader/ReaderToolbar";
import ReaderSidebar from "@/components/reader/ReaderSidebar";
import SettingsPanel from "@/components/reader/SettingsPanel";

export default function ReadPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.bookId as string;
  const supabase = useMemo(() => createClient(), []);

  const [book, setBook] = useState<Book | null>(null);
  const [epubData, setEpubData] = useState<ArrayBuffer | null>(null);
  const [cachedLocations, setCachedLocations] = useState<string | undefined>();
  const [location, setLocation] = useState<string | number | null>(null);
  const [currentChapter, setCurrentChapter] = useState("");
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toc, setToc] = useState<Array<{ label: string; href: string }>>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [currentCfi, setCurrentCfi] = useState<string | null>(null);

  const sessionIdRef = useRef<string | null>(null);
  const sessionStartRef = useRef<number>(Date.now());
  const renditionRef = useRef<unknown>(null);
  const progressSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    theme,
    fontSize,
    fontFamily,
    lineHeight,
    layout,
    isSidebarOpen,
    toggleSidebar,
    setSidebarOpen,
    activeSidebarTab,
    setActiveSidebarTab,
    isSettingsOpen,
    toggleSettings,
    setSettingsOpen,
    isToolbarVisible,
    setToolbarVisible,
  } = useReaderStore();

  useEffect(() => {
    let cancelled = false;

    async function loadBook() {
      setLoading(true);
      try {
        const bookData = await getBook(supabase, bookId);
        if (cancelled) return;
        if (!bookData) {
          setError("Book not found");
          return;
        }
        setBook(bookData);

        const [cached, progress] = await Promise.all([
          getEpubWithLocations(bookData.file_hash),
          getProgress(supabase, bookId),
        ]);
        if (cancelled) return;

        if (cached?.data) {
          setEpubData(cached.data);
          if (cached.locations) setCachedLocations(cached.locations);
        } else {
          let cloudData: ArrayBuffer | null = null;
          try {
            cloudData = await downloadEpubFromCloud(bookData.file_hash);
          } catch (err) {
            console.error("Cloud download failed:", err);
          }
          if (cancelled) return;

          if (!cloudData) {
            setError(
              "EPUB file not found locally or in the cloud. Please re-upload the file.",
            );
            return;
          }

          await storeEpubFromBuffer(cloudData, bookData.title || "book.epub");
          setEpubData(cloudData);
        }

        if (progress?.cfi && progress.cfi.startsWith("epubcfi(")) {
          setLocation(progress.cfi);
          setCurrentChapter(progress.chapter_label || "");
        }

        setLoading(false);

        Promise.all([
          getHighlights(supabase, bookId),
          getBookmarks(supabase, bookId),
        ])
          .then(([hl, bm]) => {
            if (cancelled) return;
            setHighlights(hl);
            setBookmarks(bm);
          })
          .catch((err) => console.error("Failed to load annotations:", err));

        startSession(supabase, bookId)
          .then((sid) => {
            if (cancelled) return;
            sessionIdRef.current = sid;
            sessionStartRef.current = Date.now();
          })
          .catch((err) => console.error("Failed to start session:", err));
      } catch (err) {
        console.error("Error loading book:", err);
        if (!cancelled) setError("Failed to load book");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadBook();

    return () => {
      cancelled = true;
      if (progressSaveRef.current) clearTimeout(progressSaveRef.current);
      if (sessionIdRef.current) {
        const duration = Math.floor(
          (Date.now() - sessionStartRef.current) / 1000,
        );
        endSession(supabase, sessionIdRef.current, duration, 0);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  useEffect(() => {
    if (currentCfi) {
      setIsBookmarked(bookmarks.some((b) => b.cfi === currentCfi));
    }
  }, [currentCfi, bookmarks]);

  const handleProgressUpdate = useCallback(
    (cfi: string, percentage: number, chapterLabel: string) => {
      if (!cfi || !cfi.startsWith("epubcfi(")) return;
      setCurrentCfi(cfi);
      setCurrentChapter(chapterLabel);

      if (progressSaveRef.current) clearTimeout(progressSaveRef.current);
      progressSaveRef.current = setTimeout(() => {
        upsertProgress(supabase, bookId, cfi, percentage, chapterLabel).catch(
          (err) => console.error("Failed to save progress:", err),
        );
      }, 1500);
    },
    [supabase, bookId],
  );

  const handleAddHighlight = useCallback(
    async (cfiRange: string, text: string, color: string, note?: string) => {
      const hl = await addHighlight(supabase, {
        book_id: bookId,
        cfi_range: cfiRange,
        text_content: text,
        color,
        note,
        chapter_label: currentChapter,
      });
      if (hl) setHighlights((prev) => [...prev, hl]);
    },
    [supabase, bookId, currentChapter],
  );

  const handleDeleteHighlight = useCallback(
    async (id: string) => {
      const success = await deleteHighlight(supabase, id);
      if (success) setHighlights((prev) => prev.filter((h) => h.id !== id));
    },
    [supabase],
  );

  const handleToggleBookmark = useCallback(async () => {
    if (!currentCfi) return;
    const result = await toggleBookmark(
      supabase,
      bookId,
      currentCfi,
      "",
      currentChapter,
    );
    if (result.added && result.bookmark) {
      setBookmarks((prev) => [result.bookmark!, ...prev]);
    } else {
      setBookmarks((prev) => prev.filter((b) => b.cfi !== currentCfi));
    }
  }, [supabase, bookId, currentCfi, currentChapter]);

  const handleDeleteBookmark = useCallback(
    async (id: string) => {
      const success = await removeBookmark(supabase, id);
      if (success) setBookmarks((prev) => prev.filter((b) => b.id !== id));
    },
    [supabase],
  );

  const handleNavigate = useCallback(
    (cfi: string) => {
      setLocation(cfi);
      setSidebarOpen(false);
    },
    [setSidebarOpen],
  );

  const handleSearch = useCallback(async (query: string) => {
    if (!renditionRef.current || !query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = renditionRef.current as any;
      const book = r.book;
      const results: Array<{ cfi: string; excerpt: string }> = [];
      const spine = book.spine;

      for (let i = 0; i < spine.length; i++) {
        const item = spine.get(i);
        if (!item) continue;
        await item.load(book.load.bind(book));
        const found = await item.find(query);
        if (found.length) {
          results.push(
            ...found.map((f: { cfi: string; excerpt: string }) => ({
              cfi: f.cfi,
              excerpt: f.excerpt,
            })),
          );
        }
        item.unload();
      }
      setSearchResults(results);
    } catch (err) {
      console.error("Search error:", err);
    }
  }, []);

  const handleReaderClick = useCallback(() => {
    setToolbarVisible(!isToolbarVisible);
    if (isSettingsOpen) setSettingsOpen(false);
  }, [isToolbarVisible, isSettingsOpen, setToolbarVisible, setSettingsOpen]);

  const handleBack = () => {
    if (sessionIdRef.current) {
      const duration = Math.floor(
        (Date.now() - sessionStartRef.current) / 1000,
      );
      endSession(supabase, sessionIdRef.current, duration, 0);
      sessionIdRef.current = null;
    }
    router.push("/dashboard");
  };

  const handleLocationsGenerated = useCallback(
    (locations: string) => {
      if (book?.file_hash) {
        saveEpubLocations(book.file_hash, locations).catch((err) => {
          console.error("Failed to save locations cache:", err);
        });
        setCachedLocations(locations);
      }
    },
    [book?.file_hash],
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <span className="material-symbols-rounded text-accent animate-spin !text-[40px]">
            progress_activity
          </span>
          <p className="text-text-secondary text-sm">Loading book...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full glass-card p-8 animate-fade-in-up">
          <span className="material-symbols-rounded text-accent !text-[64px] mb-4">
            error
          </span>
          <h2 className="text-xl font-medium text-text-primary mb-2">Error</h2>
          <p className="text-text-secondary mb-6">{error}</p>
          <button onClick={handleBack} className="btn-primary w-full">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!epubData) return null;

  return (
    <div
      className={`relative min-h-screen ${isSidebarOpen ? "overflow-hidden" : ""}`}
      data-reader-theme={theme}
      style={{
        backgroundColor:
          theme === "dark"
            ? "#0f0f0f"
            : theme === "sepia"
              ? "#e2d5b7"
              : "#fafafa",
      }}
    >
      <ReaderToolbar
        title={book?.title || "Reading"}
        chapter={currentChapter}
        isVisible={isToolbarVisible}
        isBookmarked={isBookmarked}
        onToggleBookmark={handleToggleBookmark}
        onToggleSidebar={() => {
          toggleSidebar();
          setSettingsOpen(false);
        }}
        onToggleSettings={() => {
          toggleSettings();
          setSidebarOpen(false);
        }}
        onBack={handleBack}
      />

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setSettingsOpen(false)}
      />

      <div onClick={handleReaderClick} className="h-screen">
        <ReaderView
          url={epubData}
          location={location}
          onLocationChange={setLocation}
          onProgressUpdate={handleProgressUpdate}
          theme={theme}
          fontSize={fontSize}
          fontFamily={fontFamily}
          lineHeight={lineHeight}
          layout={layout}
          highlights={highlights}
          onAddHighlight={handleAddHighlight}
          onTocLoaded={setToc}
          renditionRef={renditionRef}
          cachedLocations={cachedLocations}
          onLocationsGenerated={handleLocationsGenerated}
        />
      </div>

      <ReaderSidebar
        isOpen={isSidebarOpen}
        onClose={() => setSidebarOpen(false)}
        activeTab={activeSidebarTab}
        onTabChange={setActiveSidebarTab}
        toc={toc}
        bookmarks={bookmarks}
        highlights={highlights}
        onNavigate={handleNavigate}
        onDeleteBookmark={handleDeleteBookmark}
        onDeleteHighlight={handleDeleteHighlight}
        searchResults={searchResults}
        onSearch={handleSearch}
      />
    </div>
  );
}
