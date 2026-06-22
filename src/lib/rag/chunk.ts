// Shared chunking for RAG extraction (EPUB + PDF). Splits text into overlapping
// word windows so retrieval has enough local context without oversized chunks.

const TARGET_WORDS = 250;
const OVERLAP_WORDS = 40;
export const MAX_CHUNKS = 4000; // safety cap for very large books

export function* windows(text: string): Generator<string> {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;
  const step = Math.max(1, TARGET_WORDS - OVERLAP_WORDS);
  for (let i = 0; i < words.length; i += step) {
    const piece = words.slice(i, i + TARGET_WORDS).join(" ").trim();
    if (piece.length > 40) yield piece;
    if (i + TARGET_WORDS >= words.length) break;
  }
}
