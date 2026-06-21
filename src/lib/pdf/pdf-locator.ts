// PDF locators reuse the same string columns as epubcfi (reading_progress.cfi,
// bookmarks.cfi, highlights.cfi_range). They're JSON prefixed with "pdf:" so the
// reader can cheaply tell a PDF locator from an epubcfi.

const PREFIX = "pdf:";

// A rectangle in PDF user-space units (origin top-left, zoom-independent), so
// highlights stay anchored regardless of the render scale.
export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfLocator {
  page: number; // 1-based
  rects?: PdfRect[];
}

export function isPdfLocator(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function encodePdfLocator(loc: PdfLocator): string {
  return PREFIX + JSON.stringify(loc);
}

export function decodePdfLocator(value: string): PdfLocator | null {
  if (!isPdfLocator(value)) return null;
  try {
    const parsed = JSON.parse(value.slice(PREFIX.length));
    if (typeof parsed?.page !== "number") return null;
    return parsed as PdfLocator;
  } catch {
    return null;
  }
}

export function pageLocator(page: number): string {
  return encodePdfLocator({ page });
}
