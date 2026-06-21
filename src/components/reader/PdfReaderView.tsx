"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type MutableRefObject,
} from "react";
import type { Highlight } from "@/lib/supabase/types";
import type { ReaderTheme, PageLayout } from "@/stores/reader-store";
import { loadPdf, getPdfOutline } from "@/lib/pdf/pdf-loader";
import {
  decodePdfLocator,
  encodePdfLocator,
  isPdfLocator,
  type PdfRect,
} from "@/lib/pdf/pdf-locator";
import HighlightPopover from "./HighlightPopover";
import NoteModal from "./NoteModal";

interface PdfReaderViewProps {
  data: ArrayBuffer;
  initialLocator: string | null;
  zoom: number;
  theme: ReaderTheme;
  layout: PageLayout;
  highlights: Highlight[];
  onPageChange: (page: number, totalPages: number) => void;
  onAddHighlight: (
    locator: string,
    text: string,
    color: string,
    note?: string,
  ) => void;
  onTocLoaded: (toc: Array<{ label: string; href: string }>) => void;
  onAskAI?: (text: string) => void;
  gotoLocator: string | null;
  docRef: MutableRefObject<unknown>;
}

const THEME_FILTER: Record<ReaderTheme, string> = {
  light: "none",
  dark: "invert(1) hue-rotate(180deg)",
  sepia: "sepia(0.5) brightness(0.95)",
};

const THEME_BG: Record<ReaderTheme, string> = {
  light: "#fafafa",
  dark: "#0f0f0f",
  sepia: "#e2d5b7",
};

const ARROW_GUTTER = 56;
const PAGE_GAP = 16;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

export default function PdfReaderView({
  data,
  initialLocator,
  zoom,
  theme,
  layout,
  highlights,
  onPageChange,
  onAddHighlight,
  onTocLoaded,
  onAskAI,
  gotoLocator,
  docRef,
}: PdfReaderViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [selection, setSelection] = useState<{
    locator: string;
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const [noteDraft, setNoteDraft] = useState<{
    locator: string;
    text: string;
    color: string;
  } | null>(null);

  const isDouble = layout === "double";
  const step = isDouble ? 2 : 1;

  useEffect(() => {
    let cancelled = false;
    let localDoc: PdfDoc | null = null;
    (async () => {
      const d = await loadPdf(data);
      if (cancelled) {
        d.destroy?.();
        return;
      }
      localDoc = d;
      docRef.current = d;
      setDoc(d);
      setNumPages(d.numPages);
      const outline = await getPdfOutline(d);
      onTocLoaded(
        outline.map((o) => ({
          label: o.label,
          href: encodePdfLocator({ page: o.page }),
        })),
      );
    })();
    return () => {
      cancelled = true;
      localDoc?.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setArea({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (numPages) onPageChange(page, numPages);
  }, [page, numPages, onPageChange]);

  useEffect(() => {
    const loc =
      (gotoLocator && decodePdfLocator(gotoLocator)) ||
      (initialLocator && decodePdfLocator(initialLocator));
    if (loc) setPage(Math.max(1, loc.page));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gotoLocator, initialLocator]);

  const goNext = useCallback(() => {
    setSelection(null);
    setPage((p) => (p + step > numPages ? p : p + step));
  }, [step, numPages]);
  const goPrev = useCallback(() => {
    setSelection(null);
    setPage((p) => Math.max(1, p - step));
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") goNext();
      else if (e.key === "ArrowLeft" || e.key === "PageUp") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev]);

  // Reads the current native text selection and shows the popover.
  const commitSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text) return;

    const range = sel.getRangeAt(0);
    let node: Node | null = range.startContainer;
    let pageEl: HTMLElement | null = null;
    while (node) {
      if (node instanceof HTMLElement && node.dataset.page) {
        pageEl = node;
        break;
      }
      node = node.parentNode;
    }
    if (!pageEl) return;
    const pageNum = Number(pageEl.dataset.page);
    const pr = pageEl.getBoundingClientRect();

    const rects: PdfRect[] = Array.from(range.getClientRects())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => ({
        x: (r.left - pr.left) / pr.width,
        y: (r.top - pr.top) / pr.height,
        w: r.width / pr.width,
        h: r.height / pr.height,
      }));
    if (!rects.length) return;

    const br = range.getBoundingClientRect();
    setSelection({
      locator: encodePdfLocator({ page: pageNum, rects }),
      text,
      x: br.left + br.width / 2,
      y: br.top - 8,
    });
  }, []);

  // Swipe nav on touch.
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchRef.current = { x: t.clientX, y: t.clientY, t: e.timeStamp };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touchRef.current;
    const t = e.changedTouches[0];
    if (!s || !t) return;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (
      e.timeStamp - s.t < 600 &&
      Math.abs(dx) > 45 &&
      Math.abs(dx) > Math.abs(dy) * 1.8
    ) {
      if (dx < 0) goNext();
      else goPrev();
      return;
    }
    // Not a swipe — maybe a long-press selection.
    setTimeout(commitSelection, 0);
  };

  const commitHighlight = useCallback(
    (color: string) => {
      if (!selection) return;
      onAddHighlight(selection.locator, selection.text, color);
      window.getSelection()?.removeAllRanges();
      setSelection(null);
    },
    [selection, onAddHighlight],
  );

  const visible = isDouble
    ? [page, page + 1 <= numPages ? page + 1 : null].filter(
        (p): p is number => p != null,
      )
    : [page];

  const availH = Math.max(0, area.h - 32);
  const availW = isDouble
    ? Math.max(0, (area.w - ARROW_GUTTER * 2 - PAGE_GAP) / 2)
    : Math.max(0, area.w - ARROW_GUTTER * 2);

  const arrowColor =
    theme === "dark" ? "#888" : theme === "sepia" ? "#8b7355" : "#666";

  return (
    <div
      ref={containerRef}
      className="h-screen relative overflow-hidden"
      style={{ backgroundColor: THEME_BG[theme] }}
      onMouseUp={() => setTimeout(commitSelection, 0)}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="absolute inset-0 overflow-auto">
        <div
          className="min-h-full flex items-center justify-center py-4"
          style={{ gap: PAGE_GAP }}
        >
          {doc &&
            area.w > 0 &&
            visible.map((p) => (
              <PdfPage
                key={`${p}-${layout}`}
                doc={doc}
                page={p}
                availW={availW}
                availH={availH}
                zoom={zoom}
                filter={THEME_FILTER[theme]}
                highlights={highlights}
              />
            ))}
        </div>
      </div>

      {page > 1 && (
        <button
          onClick={goPrev}
          aria-label="Previous page"
          className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center cursor-pointer hover:bg-black/5 transition-colors"
          style={{ color: arrowColor }}
        >
          <span className="material-symbols-rounded !text-[32px]">
            chevron_left
          </span>
        </button>
      )}
      {page + step <= numPages && (
        <button
          onClick={goNext}
          aria-label="Next page"
          className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center cursor-pointer hover:bg-black/5 transition-colors"
          style={{ color: arrowColor }}
        >
          <span className="material-symbols-rounded !text-[32px]">
            chevron_right
          </span>
        </button>
      )}

      <HighlightPopover
        x={selection?.x || 0}
        y={selection?.y || 0}
        isVisible={!!selection}
        onHighlight={commitHighlight}
        onBookmark={() => commitHighlight("#3ECF8E")}
        onCopy={() => {
          if (selection?.text) navigator.clipboard.writeText(selection.text);
          window.getSelection()?.removeAllRanges();
          setSelection(null);
        }}
        onAddNote={(color) => {
          if (selection) {
            setNoteDraft({
              locator: selection.locator,
              text: selection.text,
              color,
            });
          }
          window.getSelection()?.removeAllRanges();
          setSelection(null);
        }}
        onAskAI={
          onAskAI
            ? () => {
                if (selection) onAskAI(selection.text);
                window.getSelection()?.removeAllRanges();
                setSelection(null);
              }
            : undefined
        }
        onClose={() => setSelection(null)}
      />

      <NoteModal
        isOpen={!!noteDraft}
        selectedText={noteDraft?.text || ""}
        initialColor={noteDraft?.color || "#3ECF8E"}
        onSave={(note, color) => {
          if (noteDraft) {
            onAddHighlight(noteDraft.locator, noteDraft.text, color, note);
          }
          setNoteDraft(null);
        }}
        onClose={() => setNoteDraft(null)}
      />
    </div>
  );
}

interface PdfPageProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc: any;
  page: number;
  availW: number;
  availH: number;
  zoom: number;
  filter: string;
  highlights: Highlight[];
}

function PdfPage({
  doc,
  page,
  availW,
  availH,
  zoom,
  filter,
  highlights,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  // Holds the active pdf.js render task so we can cancel it before starting
  // a new one — prevents "Cannot use the same canvas during multiple render()
  // operations" when availW/availH change (e.g. sidebar opens).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    if (availW <= 0 || availH <= 0) return;
    let cancelled = false;

    // Cancel any in-flight render immediately before touching the canvas.
    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
      renderTaskRef.current = null;
    }

    (async () => {
      const pdfPage = await doc.getPage(page);
      const base = pdfPage.getViewport({ scale: 1 });
      const fit = Math.min(availW / base.width, availH / base.height);
      const scale = Math.max(0.1, fit * zoom);
      const viewport = pdfPage.getViewport({ scale });
      if (cancelled) return;
      setDims({ w: viewport.width, h: viewport.height });

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * dpr);
      canvas.height = Math.ceil(viewport.height * dpr);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      ctx.scale(dpr, dpr);

      const task = pdfPage.render({ canvasContext: ctx, viewport });
      renderTaskRef.current = task;

      try {
        await task.promise;
      } catch (err: unknown) {
        // RenderingCancelledException is expected when we cancel mid-flight.
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("cancelled") || msg.includes("Rendering cancelled")) return;
        throw err;
      }

      renderTaskRef.current = null;
      if (cancelled) return;

      await buildTextLayer(pdfPage, viewport, scale, textRef.current, () =>
        cancelled,
      );
    })();
    return () => {
      cancelled = true;
      // Also cancel the render task on cleanup so the next effect run starts
      // with a clean slate.
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [doc, page, availW, availH, zoom]);

  const pageHighlights = highlights.filter(
    (h) =>
      isPdfLocator(h.cfi_range) && decodePdfLocator(h.cfi_range)?.page === page,
  );

  return (
    <div
      data-page={page}
      className="relative shadow-lg bg-white flex-shrink-0"
      style={dims ? { width: dims.w, height: dims.h } : undefined}
    >
      <canvas
        ref={canvasRef}
        style={{ filter, display: "block", pointerEvents: "none" }}
      />

      {dims &&
        pageHighlights.map((h) => {
          const loc = decodePdfLocator(h.cfi_range);
          return (loc?.rects || []).map((r, i) => (
            <div
              key={`${h.id}-${i}`}
              className="absolute pointer-events-none"
              style={{
                left: r.x * dims.w,
                top: r.y * dims.h,
                width: r.w * dims.w,
                height: r.h * dims.h,
                backgroundColor: h.color || "#3ECF8E",
                opacity: 0.3,
                mixBlendMode: "multiply",
              }}
            />
          ));
        })}

      <div
        ref={textRef}
        className="textLayer"
        style={{ position: "absolute", inset: 0, lineHeight: 1 }}
      />
    </div>
  );
}

// Builds an invisible, selectable text layer over the canvas. Manual (not
// pdf.js's TextLayer class) so positioning is fully deterministic: inline
// transparent color guarantees invisibility, and a per-span scaleX corrects
// width so the selection aligns with the rendered glyphs.
async function buildTextLayer(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfPage: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  viewport: any,
  scale: number,
  container: HTMLDivElement | null,
  isCancelled: () => boolean,
) {
  if (!container) return;
  const textContent = await pdfPage.getTextContent();
  if (isCancelled()) return;
  const mod = await import("pdfjs-dist");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Util = (mod as any).Util;

  container.innerHTML = "";
  const frag = document.createDocumentFragment();
  const spans: HTMLSpanElement[] = [];
  const targetWidths: number[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const item of textContent.items as any[]) {
    if (!item.str) continue;
    const tx = Util.transform(viewport.transform, item.transform);
    const fontHeight = Math.hypot(tx[2], tx[3]);
    if (!fontHeight) continue;

    const span = document.createElement("span");
    span.textContent = item.str;
    span.style.position = "absolute";
    span.style.left = `${tx[4]}px`;
    span.style.top = `${tx[5] - fontHeight}px`;
    span.style.fontSize = `${fontHeight}px`;
    span.style.fontFamily = "sans-serif";
    span.style.color = "transparent";
    span.style.whiteSpace = "pre";
    span.style.transformOrigin = "0 0";
    frag.appendChild(span);
    spans.push(span);
    targetWidths.push(item.width * scale);
  }

  container.appendChild(frag);
  if (isCancelled()) return;

  // One measure pass, then one write pass — corrects horizontal scale so the
  // invisible text lines up with the rendered glyphs.
  const actual = spans.map((s) => s.offsetWidth);
  for (let i = 0; i < spans.length; i++) {
    if (actual[i] > 0 && targetWidths[i] > 0) {
      spans[i].style.transform = `scaleX(${targetWidths[i] / actual[i]})`;
    }
  }
}
