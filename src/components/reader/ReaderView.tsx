"use client";

import {
  useEffect,
  useCallback,
  useRef,
  useState,
  useMemo,
  type MutableRefObject,
} from "react";
import dynamic from "next/dynamic";
import type { Highlight } from "@/lib/supabase/types";
import type {
  ReaderTheme,
  FontFamily,
  LineHeight,
  PageLayout,
} from "@/stores/reader-store";
import HighlightPopover from "./HighlightPopover";
import NoteModal from "./NoteModal";

const ReactReader = dynamic(
  () => import("react-reader").then((m) => m.ReactReader),
  { ssr: false },
);

let cachedDefaultStyles: Record<string, React.CSSProperties> | null = null;
function useReactReaderStyles() {
  const [styles, setStyles] = useState(cachedDefaultStyles);
  useEffect(() => {
    if (!cachedDefaultStyles) {
      import("react-reader").then((m) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cachedDefaultStyles = (m as any).ReactReaderStyle || null;
        setStyles(cachedDefaultStyles);
      });
    }
  }, []);
  return styles;
}

interface ReaderViewProps {
  url: string | ArrayBuffer;
  location: string | number | null;
  onLocationChange: (loc: string | number) => void;
  onProgressUpdate: (
    cfi: string,
    percentage: number,
    chapterLabel: string,
  ) => void;
  theme: ReaderTheme;
  fontSize: number;
  fontFamily: FontFamily;
  lineHeight: LineHeight;
  layout: PageLayout;
  highlights: Highlight[];
  onAddHighlight: (
    cfiRange: string,
    text: string,
    color: string,
    note?: string,
  ) => void;
  onTocLoaded: (toc: Array<{ label: string; href: string }>) => void;
  renditionRef: MutableRefObject<unknown>;
  cachedLocations?: string;
  onLocationsGenerated?: (locations: string) => void;
}

const LINE_HEIGHT_MAP: Record<LineHeight, string> = {
  compact: "1.4",
  normal: "1.7",
  relaxed: "2.0",
};

const MATHJAX_SRC =
  "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js";

// Attaches touch listeners inside a chapter iframe so a deliberate horizontal
// swipe turns the page — without the blocking overlay react-reader's `swipeable`
// uses, so text selection (highlights) still works.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function attachSwipeNavigation(contents: any, rendition: any) {
  const doc: Document | undefined = contents?.document;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win: any = contents?.window;
  if (!doc || !win) return;

  let startX = 0;
  let startY = 0;
  let startT = 0;

  const onStart = (e: TouchEvent) => {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    startT = e.timeStamp;
  };

  const onEnd = (e: TouchEvent) => {
    const t = e.changedTouches[0];
    if (!t) return;

    // Don't hijack a text selection — that's how highlights are made.
    const sel = win.getSelection?.();
    if (sel && sel.toString().length > 0) return;

    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    const dt = e.timeStamp - startT;

    // Quick, mostly-horizontal flick past a threshold.
    if (dt < 600 && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.8) {
      const rtl = rendition?.book?.package?.metadata?.direction === "rtl";
      const goNext = rtl ? dx > 0 : dx < 0;
      if (goNext) rendition.next();
      else rendition.prev();
    }
  };

  doc.addEventListener("touchstart", onStart, { passive: true });
  doc.addEventListener("touchend", onEnd, { passive: true });
}

// Injected into each chapter iframe to typeset MathML/TeX and keep wide
// display math from overflowing epub.js's paginated columns.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function injectMathJaxIntoContents(contents: any) {
  const doc: Document | undefined = contents?.document;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win: any = contents?.window;
  if (!doc || !win || !doc.body) return;

  const hasMathML = !!doc.querySelector("math");
  const hasTex = /\\\(|\\\[|\$\$/.test(doc.body.textContent || "");
  if (!hasMathML && !hasTex) return;

  if (!doc.getElementById("mathjax-readium-style")) {
    const style = doc.createElement("style");
    style.id = "mathjax-readium-style";
    style.textContent = `
      mjx-container[display="true"] {
        overflow-x: auto;
        overflow-y: hidden;
        max-width: 100%;
      }
      math { max-width: 100%; }
    `;
    doc.head.appendChild(style);
  }

  if (doc.getElementById("mathjax-readium-script")) return;

  win.MathJax = {
    tex: {
      inlineMath: [["\\(", "\\)"]],
      displayMath: [
        ["\\[", "\\]"],
        ["$$", "$$"],
      ],
    },
    options: {
      skipHtmlTags: ["script", "noscript", "style", "textarea", "pre"],
    },
    startup: { typeset: true },
  };

  const script = doc.createElement("script");
  script.id = "mathjax-readium-script";
  script.src = MATHJAX_SRC;
  script.async = true;
  doc.head.appendChild(script);
}

const THEME_STYLES: Record<ReaderTheme, { body: Record<string, string> }> = {
  dark: {
    body: {
      background: "#0f0f0f !important",
      color: "#f2f2f2 !important",
    },
  },
  light: {
    body: {
      background: "#fafafa !important",
      color: "#171717 !important",
    },
  },
  sepia: {
    body: {
      background: "#e2d5b7 !important",
      color: "#3d2e1a !important",
    },
  },
};

export default function ReaderView({
  url,
  location,
  onLocationChange,
  onProgressUpdate,
  theme,
  fontSize,
  fontFamily,
  lineHeight,
  layout,
  highlights,
  onAddHighlight,
  onTocLoaded,
  renditionRef,
  cachedLocations,
  onLocationsGenerated,
}: ReaderViewProps) {
  const [selection, setSelection] = useState<{
    cfiRange: string;
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{
    cfiRange: string;
    text: string;
    color: string;
  } | null>(null);
  const tocLoadedRef = useRef(false);
  const [isMobile, setIsMobile] = useState(false);
  const highlightsRef = useRef<Highlight[]>(highlights);
  highlightsRef.current = highlights;
  const appliedHlRef = useRef<string[]>([]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      if (args.length === 0) return;
      const first = args[0];
      if (typeof first === "number") return;
      if (
        typeof first === "object" &&
        first !== null &&
        !(first instanceof Error)
      ) {
        const keys = Object.keys(first);
        if (keys.length === 0) return;
        if ("message" in first) {
          const m = String((first as Record<string, unknown>).message);
          if (
            m.includes("File not found") ||
            m.includes("not found") ||
            m.includes("Failed to load")
          )
            return;
        }
      }
      if (
        typeof first === "string" &&
        (first.includes("File not found") ||
          first.includes("No Section Found") ||
          first.includes("Failed to load"))
      )
        return;
      originalConsoleError.apply(console, args);
    };

    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const msg = event.reason?.message || String(event.reason);
      if (msg.includes("No Section Found") || msg.includes("File not found")) {
        event.preventDefault();
        onLocationChange(0);
      }
    };
    window.addEventListener("unhandledrejection", rejectionHandler);

    return () => {
      console.error = originalConsoleError;
      window.removeEventListener("unhandledrejection", rejectionHandler);
    };
  }, [onLocationChange]);

  const applyStyles = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rendition: any) => {
      if (!rendition) return;

      const fontFam =
        fontFamily === "serif"
          ? "'Newsreader', Georgia, serif"
          : "'Instrument Sans', system-ui, sans-serif";

      rendition.themes.override("font-size", `${fontSize}px`, true);
      rendition.themes.override("font-family", fontFam, true);
      rendition.themes.override(
        "line-height",
        LINE_HEIGHT_MAP[lineHeight],
        true,
      );

      const themeStyle = THEME_STYLES[theme];
      rendition.themes.default({
        body: {
          ...themeStyle.body,
          "font-size": `${fontSize}px !important`,
          "font-family": `${fontFam} !important`,
          "line-height": `${LINE_HEIGHT_MAP[lineHeight]} !important`,
          padding: "0 20px !important",
        },
        "p, div, span, li, td, th, h1, h2, h3, h4, h5, h6": {
          color: `${themeStyle.body.color}`,
          "font-family": `${fontFam} !important`,
          "line-height": `${LINE_HEIGHT_MAP[lineHeight]} !important`,
        },
        a: {
          color: "#3ECF8E !important",
        },
        img: {
          "max-width": "100% !important",
          height: "auto !important",
        },
        // Wide code/terminal blocks must wrap, or they overflow epub.js's
        // paginated columns and bleed onto the neighbouring page.
        pre: {
          "white-space": "pre-wrap !important",
          "overflow-wrap": "break-word !important",
          "word-break": "break-word !important",
          "max-width": "100% !important",
          overflow: "hidden !important",
        },
        "pre, code, kbd, samp": {
          "overflow-wrap": "break-word !important",
        },
      });
    },
    [theme, fontSize, fontFamily, lineHeight],
  );

  const applyHighlights = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rendition: any) => {
      if (!rendition) return;
      const current = highlightsRef.current;

      appliedHlRef.current.forEach((cfi) => {
        try {
          rendition.annotations.remove(cfi, "highlight");
        } catch {}
      });

      current.forEach((hl) => {
        try {
          rendition.annotations.add(
            "highlight",
            hl.cfi_range,
            {},
            undefined,
            "hl",
            {
              fill: hl.color || "#3ECF8E",
              "fill-opacity": "0.3",
              "mix-blend-mode": "multiply",
            },
          );
        } catch {}
      });

      appliedHlRef.current = current.map((hl) => hl.cfi_range);
    },
    [],
  );

  const redrawTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRedraw = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rendition: any, delay = 80) => {
      if (redrawTimerRef.current) clearTimeout(redrawTimerRef.current);
      redrawTimerRef.current = setTimeout(() => {
        applyHighlights(rendition);
      }, delay);
    },
    [applyHighlights],
  );

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rendition = renditionRef.current as any;
    if (rendition) {
      applyStyles(rendition);
      scheduleRedraw(rendition, 150);
    }
  }, [
    theme,
    fontSize,
    fontFamily,
    lineHeight,
    applyStyles,
    scheduleRedraw,
    renditionRef,
  ]);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rendition = renditionRef.current as any;
    if (rendition) {
      applyHighlights(rendition);
    }
  }, [highlights, applyHighlights, renditionRef]);

  useEffect(() => {
    return () => {
      if (redrawTimerRef.current) clearTimeout(redrawTimerRef.current);
    };
  }, []);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rendition = renditionRef.current as any;
    if (rendition?.spread) {
      rendition.spread(layout === "double" ? "auto" : "none", 800);
    }
  }, [layout, renditionRef]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleRendition = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (rendition: any) => {
      renditionRef.current = rendition;
      applyStyles(rendition);

      rendition.hooks.content.register(injectMathJaxIntoContents);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rendition.hooks.content.register((c: any) =>
        attachSwipeNavigation(c, rendition),
      );
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (rendition.getContents() || []).forEach((c: any) => {
          injectMathJaxIntoContents(c);
          attachSwipeNavigation(c, rendition);
        });
      } catch {}

      rendition.book.ready
        .then(() => {
          if (cachedLocations) {
            rendition.book.locations.load(cachedLocations);
            return null;
          } else {
            return rendition.book.locations.generate(1600);
          }
        })
        .then((locations: unknown) => {
          if (locations && onLocationsGenerated) {
            onLocationsGenerated(rendition.book.locations.save());
          }
        })
        .catch((err: unknown) => {
          console.warn("Failed to process locations", err);
        });

      if (!tocLoadedRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        rendition.book.loaded.navigation.then((nav: any) => {
          const tocItems = nav.toc.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (item: any) => ({
              label: item.label?.trim() || "Untitled",
              href: item.href,
            }),
          );
          onTocLoaded(tocItems);
          tocLoadedRef.current = true;
        });
      }

      rendition.on(
        "selected",
        (cfiRange: string, contents: { window: Window }) => {
          const sel = contents.window.getSelection();
          if (!sel || sel.rangeCount === 0) return;

          const text = sel.toString().trim();
          if (!text) return;

          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          const iframe = document.querySelector("iframe");
          const iframeRect = iframe?.getBoundingClientRect() || {
            left: 0,
            top: 0,
          };

          setSelection({
            cfiRange,
            text,
            x: rect.left + iframeRect.left + rect.width / 2,
            y: rect.top + iframeRect.top - 10,
          });
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      rendition.on("rendered", (_section: unknown, view: any) => {
        scheduleRedraw(rendition, 80);

        const win: (Window & typeof globalThis) | undefined =
          view?.window || view?.contents?.window;
        const doc: Document | undefined =
          view?.document || view?.contents?.document;

        try {
          win?.document?.fonts?.ready?.then(() =>
            scheduleRedraw(rendition, 30),
          );
        } catch {}

        if (doc?.querySelector("math")) {
          scheduleRedraw(rendition, 600);
        }

        if (win && "ResizeObserver" in win && doc?.body) {
          try {
            const ro = new win.ResizeObserver(() =>
              scheduleRedraw(rendition, 60),
            );
            ro.observe(doc.body);
          } catch {}
        }
      });

      rendition.on("relocated", () => scheduleRedraw(rendition, 60));
      rendition.on("resized", () => scheduleRedraw(rendition, 60));
    },
    [applyStyles, applyHighlights, scheduleRedraw, onTocLoaded, renditionRef],
  );

  const handleLocationChanged = useCallback(
    (epubcifi: string | number) => {
      onLocationChange(epubcifi);

      if (typeof epubcifi !== "string" || !epubcifi.startsWith("epubcfi(")) {
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rendition = renditionRef.current as any;
      if (!rendition) return;

      try {
        const loc = rendition.currentLocation();
        if (!loc || !loc.start) return;

        let percentage = loc.start.percentage || 0;
        let chapterLabel = "";

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const book = rendition.book as any;

        if (book && book.locations && book.locations.length() > 0) {
          percentage = book.locations.percentageFromCfi(epubcifi);
          const totalPages = book.locations.length();
          const currentPage = book.locations.locationFromCfi(epubcifi);
          if (currentPage && totalPages) {
            chapterLabel = `Page ${currentPage} of ${totalPages}`;
          }
        } else if (loc.start.displayed) {
          chapterLabel = `Page ${loc.start.displayed.page || 0} of ${loc.start.displayed.total || 0}`;
        }

        onProgressUpdate(epubcifi, percentage, chapterLabel);
      } catch {}
    },
    [onLocationChange, onProgressUpdate, renditionRef],
  );

  const handleHighlight = useCallback(
    (color: string) => {
      if (!selection) return;
      onAddHighlight(selection.cfiRange, selection.text, color);

      const iframe = document.querySelector("iframe");
      if (iframe?.contentWindow) {
        iframe.contentWindow.getSelection()?.removeAllRanges();
      }
      setSelection(null);
    },
    [selection, onAddHighlight],
  );

  const handleCopy = useCallback(() => {
    if (!selection) return;
    navigator.clipboard.writeText(selection.text);
    setSelection(null);
  }, [selection]);

  const handleBookmarkSelection = useCallback(() => {
    if (!selection) return;
    onAddHighlight(selection.cfiRange, selection.text, "#3ECF8E");
    setSelection(null);
  }, [selection, onAddHighlight]);

  const themeBg =
    theme === "dark" ? "#0f0f0f" : theme === "sepia" ? "#e2d5b7" : "#fafafa";
  const arrowColor =
    theme === "dark" ? "#666" : theme === "sepia" ? "#8b7355" : "#999";

  // Tighter margins and smaller arrows on phones so text isn't cramped.
  const sideInset = isMobile ? 24 : 50;
  const arrowSize = isMobile ? 28 : 40;

  return (
    <div className="h-full relative">
      <ReactReader
        url={url}
        location={location ?? null}
        locationChanged={handleLocationChanged}
        getRendition={handleRendition}
        epubOptions={{
          flow: "paginated",
          manager: "default",
          spread: layout === "double" ? "auto" : "none",
          minSpreadWidth: 800,
          allowPopups: true,
          allowScriptedContent: true,
        }}
        readerStyles={{
          container: {
            overflow: "hidden",
            position: "relative",
            height: "100%",
            backgroundColor: themeBg,
          },
          readerArea: {
            position: "relative",
            zIndex: 1,
            height: "100%",
            width: "100%",
            backgroundColor: themeBg,
            transition: "all .3s ease",
          },
          containerExpanded: {
            transform: "translateX(256px)",
          },
          titleArea: {
            position: "absolute",
            top: 20,
            left: sideInset,
            right: sideInset,
            textAlign: "center",
            color: arrowColor,
            display: "none",
          },
          reader: {
            position: "absolute",
            top: 64,
            left: sideInset,
            bottom: 20,
            right: sideInset,
          },
          swipeWrapper: {
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            zIndex: 200,
          },
          prev: {
            left: isMobile ? -6 : 1,
            zIndex: 100,
          },
          next: {
            right: isMobile ? -6 : 1,
            zIndex: 100,
          },
          arrow: {
            outline: "none",
            border: "none",
            background: "none",
            position: "absolute",
            top: "50%",
            marginTop: isMobile ? "-22px" : "-32px",
            fontSize: `${arrowSize}px`,
            padding: isMobile ? "6px" : "10px",
            color: arrowColor,
            fontFamily: "arial, sans-serif",
            cursor: "pointer",
            userSelect: "none",
            appearance: "none",
            fontWeight: "normal",
          },
          arrowHover: {
            color: theme === "dark" ? "#999" : "#333",
          },
          tocArea: {
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 0,
            width: 256,
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            background: "#1a1a1a",
            padding: "10px 0",
            display: "none",
          },
          tocAreaButton: {
            userSelect: "none",
            appearance: "none",
            background: "none",
            border: "none",
            display: "block",
            fontFamily: "sans-serif",
            width: "100%",
            fontSize: ".9em",
            textAlign: "left",
            padding: ".9em 1em",
            borderBottom: "1px solid #333",
            color: "#ccc",
            boxSizing: "border-box",
            outline: "none",
            cursor: "pointer",
          },
          tocButton: {
            display: "none",
          },
          tocButtonExpanded: {},
          tocButtonBar: {
            position: "absolute",
            width: "60%",
            background: "#ccc",
            height: 2,
            left: "50%",
            margin: "-1px -30%",
            top: "50%",
            transition: "all .5s ease",
          },
          tocButtonBarTop: {
            top: "35%",
          },
          loadingView: {
            position: "absolute",
            top: "50%",
            left: "10%",
            right: "10%",
            color: arrowColor,
            textAlign: "center",
            marginTop: "-.5em",
          },
          errorView: {
            position: "absolute",
            top: "50%",
            left: "10%",
            right: "10%",
            color: arrowColor,
            textAlign: "center",
            marginTop: "-.5em",
          },
          tocBackground: {
            display: "none",
          },
          toc: {
            display: "none",
          },
          tocButtonBottom: {
            display: "none",
          },
        }}
      />

      <HighlightPopover
        x={selection?.x || 0}
        y={selection?.y || 0}
        isVisible={!!selection}
        onHighlight={handleHighlight}
        onBookmark={handleBookmarkSelection}
        onCopy={handleCopy}
        onAddNote={(color) => {
          if (!selection) return;
          setNoteDraft({
            cfiRange: selection.cfiRange,
            text: selection.text,
            color,
          });
          setSelection(null);
        }}
        onClose={() => setSelection(null)}
      />

      <NoteModal
        isOpen={!!noteDraft}
        selectedText={noteDraft?.text || ""}
        initialColor={noteDraft?.color || "#3ECF8E"}
        onSave={(note, color) => {
          if (noteDraft) {
            onAddHighlight(noteDraft.cfiRange, noteDraft.text, color, note);
          }
          setNoteDraft(null);
        }}
        onClose={() => setNoteDraft(null)}
      />
    </div>
  );
}
