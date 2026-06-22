// Client-side EPUB text extraction. Runs in the browser because epubjs needs a
// DOM (Cloudflare Workers have none) and the book is already loaded in the
// reader. Produces overlapping word-window chunks with a chapter label and a
// section-level CFI anchor (precise per-chunk CFIs are deferred to a later pass).

import type { RagChunk } from "./types";
import { MAX_CHUNKS, windows } from "./chunk";

type TocItem = { label: string; href: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EpubBook = any;

function normalizeHref(href: string): string {
  return href.split("#")[0].replace(/^\.?\//, "");
}

function buildTocMap(toc: TocItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of toc) {
    if (item.href) map.set(normalizeHref(item.href), item.label);
  }
  return map;
}

export async function extractBookChunks(
  book: EpubBook,
  toc: TocItem[] = [],
): Promise<RagChunk[]> {
  if (!book?.spine) return [];
  if (book.ready) await book.ready;

  const tocMap = buildTocMap(toc);
  const spine = book.spine;
  const chunks: RagChunk[] = [];
  let index = 0;

  for (let i = 0; i < spine.length; i++) {
    const item = spine.get(i);
    if (!item) continue;
    try {
      const doc = await item.load(book.load.bind(book));
      const raw: string = doc?.body?.textContent ?? "";
      const text = raw.replace(/\s+/g, " ").trim();
      if (text) {
        const href = normalizeHref(item.href || "");
        const chapter = tocMap.get(href) || `Section ${i + 1}`;
        const cfi = item.cfiBase ? `epubcfi(${item.cfiBase}!/4)` : "";
        for (const piece of windows(text)) {
          chunks.push({ chunkIndex: index++, chapterLabel: chapter, cfi, content: piece });
          if (chunks.length >= MAX_CHUNKS) break;
        }
      }
    } catch {
      // Skip unreadable sections rather than failing the whole index.
    } finally {
      try {
        item.unload();
      } catch {
        // ignore
      }
    }
    if (chunks.length >= MAX_CHUNKS) break;
  }

  return chunks;
}
