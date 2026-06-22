// Client-side PDF text extraction for RAG. Uses the already-loaded pdf.js
// document (exposed by PdfReaderView via docRef) — pages are read with
// getTextContent(), the same call the reader uses. The page number is the
// citation anchor (PDFs have no CFI).

import type { RagChunk } from "./types";
import { MAX_CHUNKS, windows } from "./chunk";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;

export async function extractPdfChunks(doc: PdfDoc): Promise<RagChunk[]> {
  if (!doc?.numPages || typeof doc.getPage !== "function") return [];

  const chunks: RagChunk[] = [];
  let index = 0;

  for (let p = 1; p <= doc.numPages; p++) {
    try {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      const text = (tc.items as { str?: string }[])
        .map((it) => it.str ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (text) {
        for (const piece of windows(text)) {
          chunks.push({
            chunkIndex: index++,
            chapterLabel: `Page ${p}`,
            cfi: String(p),
            content: piece,
          });
          if (chunks.length >= MAX_CHUNKS) break;
        }
      }
      page.cleanup?.();
    } catch {
      // Skip unreadable pages rather than failing the whole index.
    }
    if (chunks.length >= MAX_CHUNKS) break;
  }

  return chunks;
}
