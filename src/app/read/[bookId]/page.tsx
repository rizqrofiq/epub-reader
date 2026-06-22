"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getBook, updateBookStorageKey } from "@/lib/supabase/queries/books";
import { getProgress } from "@/lib/supabase/queries/progress";
import {
  getHighlights,
  deleteAllHighlights,
} from "@/lib/supabase/queries/highlights";
import { getBookmarks } from "@/lib/supabase/queries/bookmarks";
import { startSession, endSession } from "@/lib/supabase/queries/history";
import { runOrQueue } from "@/lib/offline-queue";
import {
  getEpubWithLocations,
  saveEpubLocations,
  storeEpubFromBuffer,
  cacheBook,
  getCachedBook,
} from "@/lib/epub-cache";
import { downloadEpubFromCloud, uploadEpubToCloud } from "@/lib/epub-cloud";
import { ensureBookIndexed } from "@/lib/rag/client";
import { extractBookChunks } from "@/lib/rag/extract";
import { extractPdfChunks } from "@/lib/rag/extract-pdf";
import type { RagChunk } from "@/lib/rag/types";
import { useReaderStore } from "@/stores/reader-store";
import type { Book, Highlight, Bookmark } from "@/lib/supabase/types";
import ReaderView from "@/components/reader/ReaderView";
import PdfReaderView from "@/components/reader/PdfReaderView";
import { pageLocator, isPdfLocator } from "@/lib/pdf/pdf-locator";
import ReaderToolbar from "@/components/reader/ReaderToolbar";
import ReaderSidebar from "@/components/reader/ReaderSidebar";
import SettingsPanel from "@/components/reader/SettingsPanel";
import NoSSR, { FullScreenSpinner } from "@/components/NoSSR";

function ReadPageInner() {
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
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [aiPendingText, setAiPendingText] = useState<string | null>(null);
  const [ragProgress, setRagProgress] = useState<number | null>(null);
  const [ragError, setRagError] = useState<string | null>(null);
  const ragTriggeredRef = useRef(false);

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
    pdfZoom,
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
        let bookData = await getBook(supabase, bookId);
        if (bookData) {
          cacheBook(bookData).catch(() => { });
        } else {
          // Supabase unreachable (offline) — fall back to the cached row.
          bookData = (await getCachedBook(bookId)) ?? null;
        }
        if (cancelled) return;
        if (!bookData) {
          setError("Book not found");
          return;
        }
        setBook(bookData);

        const [cached, progress] = await Promise.all([
          getEpubWithLocations(bookData.file_hash),
          getProgress(supabase, bookId).catch(() => null),
        ]);
        if (cancelled) return;

        if (cached?.data) {
          setEpubData(cached.data);
          if (cached.locations) setCachedLocations(cached.locations);

          if (!bookData.storage_key) {
            const id = bookData.id;
            const hash = bookData.file_hash;
            uploadEpubToCloud(hash, cached.data)
              .then((key) => {
                if (key) updateBookStorageKey(supabase, id, key);
              })
              .catch(() => { });
          }
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
              "File not found locally or in the cloud. Please re-upload it.",
            );
            return;
          }

          await storeEpubFromBuffer(cloudData, bookData.title || "book");
          setEpubData(cloudData);
        }

        if (
          progress?.cfi &&
          (progress.cfi.startsWith("epubcfi(") || isPdfLocator(progress.cfi))
        ) {
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
        runOrQueue(supabase, "progress.upsert", {
          bookId,
          cfi,
          percentage,
          chapterLabel,
        }).catch(() => { });
      }, 1500);
    },
    [supabase, bookId],
  );

  const handlePdfPageChange = useCallback(
    (page: number, totalPages: number) => {
      const label = `Page ${page} of ${totalPages}`;
      setCurrentChapter(label);
      const locator = pageLocator(page);
      setCurrentCfi(locator);

      if (progressSaveRef.current) clearTimeout(progressSaveRef.current);
      progressSaveRef.current = setTimeout(() => {
        runOrQueue(supabase, "progress.upsert", {
          bookId,
          cfi: locator,
          percentage: totalPages > 0 ? page / totalPages : 0,
          chapterLabel: label,
        }).catch(() => { });
      }, 1500);
    },
    [supabase, bookId],
  );

  const handleAddHighlight = useCallback(
    (cfiRange: string, text: string, color: string, note?: string) => {
      const id = crypto.randomUUID();
      setHighlights((prev) => [
        ...prev,
        {
          id,
          user_id: "",
          book_id: bookId,
          cfi_range: cfiRange,
          text_content: text,
          color,
          note: note ?? null,
          chapter_label: currentChapter,
          created_at: new Date().toISOString(),
        },
      ]);
      runOrQueue(supabase, "highlight.add", {
        id,
        book_id: bookId,
        cfi_range: cfiRange,
        text_content: text,
        color,
        note: note ?? null,
        chapter_label: currentChapter,
      }).catch(() => { });
    },
    [supabase, bookId, currentChapter],
  );

  const handleClearHighlights = useCallback(() => {
    setShowClearConfirm(true);
  }, []);

  const confirmClearHighlights = useCallback(async () => {
    setShowClearConfirm(false);
    setHighlights([]);
    await deleteAllHighlights(supabase, bookId);
  }, [supabase, bookId]);

  const handleDeleteHighlight = useCallback(
    (id: string) => {
      setHighlights((prev) => prev.filter((h) => h.id !== id));
      runOrQueue(supabase, "highlight.delete", { id }).catch(() => { });
    },
    [supabase],
  );

  const handleToggleBookmark = useCallback(() => {
    if (!currentCfi) return;
    const existing = bookmarks.find((b) => b.cfi === currentCfi);
    if (existing) {
      setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
      runOrQueue(supabase, "bookmark.delete", { id: existing.id }).catch(
        () => { },
      );
      return;
    }
    const id = crypto.randomUUID();
    setBookmarks((prev) => [
      {
        id,
        user_id: "",
        book_id: bookId,
        cfi: currentCfi,
        text_excerpt: null,
        label: null,
        chapter_label: currentChapter,
        created_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    runOrQueue(supabase, "bookmark.add", {
      id,
      book_id: bookId,
      cfi: currentCfi,
      text_excerpt: null,
      chapter_label: currentChapter,
    }).catch(() => { });
  }, [supabase, bookId, currentCfi, currentChapter, bookmarks]);

  const handleDeleteBookmark = useCallback(
    (id: string) => {
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
      runOrQueue(supabase, "bookmark.delete", { id }).catch(() => { });
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

  // Jump to an AI book-source anchor: a PDF page number or an EPUB CFI.
  const handleJumpToSource = useCallback(
    (anchor: string) => {
      if (!anchor) return;
      if (book?.format === "pdf") {
        const page = parseInt(anchor, 10);
        if (!Number.isNaN(page)) setLocation(pageLocator(page));
      } else {
        setLocation(anchor);
      }
      setSidebarOpen(false);
    },
    [book?.format, setSidebarOpen],
  );

  // Stop arrow / page keys from flipping the book while the user is typing
  // (e.g. the AI chat input). react-reader binds its own keyup nav on `document`
  // that we can't disable via props, so we intercept in the capture phase and
  // stop propagation before it reaches that handler. PdfReaderView guards itself.
  useEffect(() => {
    const NAV_KEYS = new Set([
      "ArrowLeft",
      "ArrowRight",
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
    ]);
    const guard = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        !!t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);
      if (typing && NAV_KEYS.has(e.key)) e.stopPropagation();
    };
    document.addEventListener("keyup", guard, true);
    document.addEventListener("keydown", guard, true);
    return () => {
      document.removeEventListener("keyup", guard, true);
      document.removeEventListener("keydown", guard, true);
    };
  }, []);

  useEffect(() => {
    if (ragTriggeredRef.current) return;
    if (activeSidebarTab !== "ai" || !isSidebarOpen) return;
    if (!book || !bookId) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ref = renditionRef.current as any;
    if (!ref) return;

    let getChunks: () => Promise<RagChunk[]>;
    if (book.format === "pdf") {
      if (typeof ref.getPage !== "function") return;
      getChunks = () => extractPdfChunks(ref);
    } else {
      const epubBook = ref.book;
      if (!epubBook) return;
      getChunks = () => extractBookChunks(epubBook, toc);
    }

    ragTriggeredRef.current = true;
    ensureBookIndexed(bookId, getChunks, setRagProgress).then((res) => {
      if (!res.ok) {
        setRagError(res.error || "Indexing failed");
        ragTriggeredRef.current = false;
      }
      setTimeout(() => setRagProgress(null), 1500);
    });
  }, [activeSidebarTab, isSidebarOpen, book, toc, bookId]);

  const handleSearch = useCallback(
    async (query: string) => {
      const q = query.trim();
      if (!renditionRef.current || !q) {
        setSearchResults([]);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = renditionRef.current as any;
      const results: Array<{ cfi: string; excerpt: string }> = [];
      const MAX_RESULTS = 100;

      try {
        if (book?.format === "pdf") {
          if (typeof r.getPage !== "function") {
            setSearchResults([]);
            return;
          }
          const needle = q.toLowerCase();
          for (let p = 1; p <= r.numPages && results.length < MAX_RESULTS; p++) {
            const page = await r.getPage(p);
            const tc = await page.getTextContent();
            const text = (tc.items as { str?: string }[])
              .map((it) => it.str ?? "")
              .join(" ");
            const idx = text.toLowerCase().indexOf(needle);
            if (idx >= 0) {
              const start = Math.max(0, idx - 40);
              const excerpt = text
                .slice(start, idx + q.length + 60)
                .replace(/\s+/g, " ")
                .trim();
              results.push({
                cfi: pageLocator(p),
                excerpt: `Page ${p}: …${excerpt}…`,
              });
            }
            page.cleanup?.();
          }
        } else {
          const book = r.book;
          if (!book?.spine) {
            setSearchResults([]);
            return;
          }
          const spine = book.spine;
          for (let i = 0; i < spine.length; i++) {
            const item = spine.get(i);
            if (!item) continue;
            await item.load(book.load.bind(book));
            const found = await item.find(q);
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
        }
        setSearchResults(results);
      } catch (err) {
        console.error("Search error:", err);
        setSearchResults([]);
      }
    },
    [book?.format],
  );

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
        sidebarOpen={isSidebarOpen}
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
        format={book?.format}
      />

      <div
        className={`transition-[margin] duration-300 ease-out ${isSidebarOpen ? "lg:mr-[380px]" : ""
          }`}
      >
        {book?.format === "pdf" ? (
          <PdfReaderView
            data={epubData}
            initialLocator={
              typeof location === "string" && isPdfLocator(location)
                ? location
                : null
            }
            zoom={pdfZoom}
            theme={theme}
            layout={layout}
            highlights={highlights}
            onPageChange={handlePdfPageChange}
            onAddHighlight={handleAddHighlight}
            onAskAI={(text) => {
              setAiPendingText(text);
              setSidebarOpen(true);
              setActiveSidebarTab("ai");
            }}
            onTocLoaded={setToc}
            gotoLocator={
              typeof location === "string" && isPdfLocator(location)
                ? location
                : null
            }
            docRef={renditionRef}
          />
        ) : (
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
              onAskAI={(text) => {
                setAiPendingText(text);
                setSidebarOpen(true);
                setActiveSidebarTab("ai");
              }}
              onTocLoaded={setToc}
              renditionRef={renditionRef}
              cachedLocations={cachedLocations}
              onLocationsGenerated={handleLocationsGenerated}
            />
          </div>
        )}
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
        onClearHighlights={handleClearHighlights}
        searchResults={searchResults}
        onSearch={handleSearch}
        bookId={bookId}
        bookTitle={book?.title}
        chapterLabel={currentChapter}
        aiPendingText={aiPendingText}
        onAiPendingConsumed={() => setAiPendingText(null)}
        onJumpToSource={handleJumpToSource}
      />

      {/* RAG indexing status */}
      {(ragProgress !== null || ragError) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 px-3.5 py-2 rounded-full bg-bg-elevated border border-border shadow-xl text-xs text-text-secondary animate-fade-in">
          {ragError ? (
            <>
              <span className="material-symbols-rounded !text-[15px] text-destructive">
                error
              </span>
              <span>Book indexing failed — {ragError}</span>
            </>
          ) : ragProgress !== null && ragProgress < 100 ? (
            <>
              <span className="material-symbols-rounded !text-[15px] text-accent animate-spin">
                progress_activity
              </span>
              <span>Indexing this book for grounded answers… {ragProgress}%</span>
            </>
          ) : (
            <>
              <span className="material-symbols-rounded !text-[15px] text-accent">
                check_circle
              </span>
              <span>Book ready for grounded answers</span>
            </>
          )}
        </div>
      )}

      {/* Clear highlights confirmation */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowClearConfirm(false)}
          />
          <div className="relative w-full max-w-sm bg-bg-secondary border border-border rounded-sm shadow-2xl p-6 animate-scale-in">
            <h2 className="text-base font-semibold text-text-primary mb-2">
              Clear all highlights?
            </h2>
            <p className="text-sm text-text-secondary mb-6">
              This will permanently delete all highlights in this book. This
              cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 rounded-sm text-sm text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-all duration-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={confirmClearHighlights}
                className="px-4 py-2 rounded-sm bg-destructive hover:bg-destructive-hover text-white text-sm font-medium transition-all duration-200 cursor-pointer"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReadPage() {
  return (
    <NoSSR fallback={<FullScreenSpinner />}>
      <ReadPageInner />
    </NoSSR>
  );
}
