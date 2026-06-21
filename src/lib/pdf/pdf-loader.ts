// Thin wrapper around pdf.js. Dynamically imported so the ~1MB library only
// loads for PDF books. The worker is served from /pdf.worker.min.mjs (a static
// asset copied from pdfjs-dist) so it works offline and doesn't depend on a CDN
// or bundler worker resolution on Cloudflare Workers.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfDoc = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfModule = any;

let pdfjs: PdfModule | null = null;

async function getPdfjs(): Promise<PdfModule> {
  if (pdfjs) return pdfjs;
  const mod = await import("pdfjs-dist");
  mod.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  pdfjs = mod;
  return mod;
}

export async function loadPdf(data: ArrayBuffer): Promise<PdfDoc> {
  const mod = await getPdfjs();
  // Copy into a fresh buffer — pdf.js transfers/detaches the ArrayBuffer, which
  // would corrupt the cached copy we keep in IndexedDB.
  const buf = data.slice(0);
  const task = mod.getDocument({ data: buf });
  return task.promise;
}

export interface PdfTocItem {
  label: string;
  page: number;
}

// Flattens the PDF outline into a TOC with resolved page numbers.
export async function getPdfOutline(doc: PdfDoc): Promise<PdfTocItem[]> {
  const outline = await doc.getOutline().catch(() => null);
  if (!outline) return [];

  const items: PdfTocItem[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function resolvePage(dest: any): Promise<number | null> {
    try {
      const explicit =
        typeof dest === "string" ? await doc.getDestination(dest) : dest;
      if (!explicit || !explicit[0]) return null;
      const index = await doc.getPageIndex(explicit[0]);
      return index + 1;
    } catch {
      return null;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function walk(nodes: any[], depth: number) {
    for (const node of nodes) {
      const page = await resolvePage(node.dest);
      items.push({
        label: `${" ".repeat(depth * 2)}${node.title?.trim() || "Untitled"}`,
        page: page ?? 1,
      });
      if (node.items?.length) await walk(node.items, depth + 1);
    }
  }

  await walk(outline, 0);
  return items;
}

// Renders one page to a data URL — used to generate a cover thumbnail.
export async function renderPageThumbnail(
  doc: PdfDoc,
  pageNumber: number,
  maxWidth = 400,
): Promise<string | null> {
  try {
    const page = await doc.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, maxWidth / base.width);
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  }
}
