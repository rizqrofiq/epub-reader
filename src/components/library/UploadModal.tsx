"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { addBook } from "@/lib/supabase/queries/books";
import { storeEpub } from "@/lib/epub-cache";
import { uploadEpubToCloud, QuotaError } from "@/lib/epub-cloud";
import ePub from "epubjs";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function UploadModal({
  isOpen,
  onClose,
  onSuccess,
}: UploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = useMemo(() => createClient(), []);

  const processFile = useCallback(
    async (file: File) => {
      const name = file.name.toLowerCase();
      const isPdf = name.endsWith(".pdf");
      const isEpub = name.endsWith(".epub");
      if (!isPdf && !isEpub) {
        setError("Please select an EPUB or PDF file");
        return;
      }

      if (file.size > 100 * 1024 * 1024) {
        setError("File size must be under 100MB");
        return;
      }

      setUploading(true);
      setError(null);

      try {
        setStatus("Caching file locally...");
        const fileHash = await storeEpub(file);

        const arrayBuffer = await file.arrayBuffer();

        setStatus("Uploading to cloud...");
        let storageKey: string | null = null;
        try {
          storageKey = await uploadEpubToCloud(fileHash, arrayBuffer);
        } catch (err) {
          if (err instanceof QuotaError) {
            setError(err.message);
            setUploading(false);
            setStatus("");
            return;
          }
          console.warn("Cloud upload failed, continuing with local copy:", err);
        }

        setStatus("Extracting metadata...");
        let saved;

        if (isPdf) {
          const { loadPdf, renderPageThumbnail } =
            await import("@/lib/pdf/pdf-loader");
          const doc = await loadPdf(arrayBuffer);
          const info = await doc.getMetadata().catch(() => null);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const docInfo: any = info?.info || {};
          const coverUrl = await renderPageThumbnail(doc, 1).catch(() => null);

          setStatus("Saving to library...");
          saved = await addBook(supabase, {
            title: docInfo.Title || file.name.replace(/\.pdf$/i, ""),
            author: docInfo.Author || null,
            cover_url: coverUrl,
            file_hash: fileHash,
            source: "upload",
            format: "pdf",
            storage_key: storageKey,
            file_size: file.size,
            metadata: {
              pages: doc.numPages,
              producer: docInfo.Producer,
            },
          });
          doc.destroy?.();
        } else {
          const book = ePub(arrayBuffer);
          await book.ready;
          const metadata = await book.loaded.metadata;
          let coverUrl: string | null = null;
          try {
            const coverHref = await book.coverUrl();
            if (coverHref) {
              const response = await fetch(coverHref);
              const blob = await response.blob();
              coverUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });
            }
          } catch {}

          setStatus("Saving to library...");
          saved = await addBook(supabase, {
            title: metadata.title || file.name.replace(/\.epub$/i, ""),
            author: metadata.creator || null,
            cover_url: coverUrl,
            file_hash: fileHash,
            source: "upload",
            format: "epub",
            storage_key: storageKey,
            file_size: file.size,
            metadata: {
              publisher: metadata.publisher,
              language: metadata.language,
              description: metadata.description,
            },
          });
          book.destroy();
        }

        if (saved) {
          onSuccess();
        } else {
          setError("Failed to save book metadata");
        }
      } catch (err) {
        console.error("Upload error:", err);
        setError("Failed to process file");
      } finally {
        setUploading(false);
        setStatus("");
      }
    },
    [supabase, onSuccess],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-bg-secondary border border-border rounded-sm shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between p-6 pb-0">
          <h2 className="text-lg font-semibold text-text-primary">
            Upload Book
          </h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="p-1.5 rounded-sm text-text-tertiary hover:text-text-primary hover:bg-bg-elevated transition-all duration-200 cursor-pointer"
          >
            <span className="material-symbols-rounded">close</span>
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 rounded-sm bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center gap-2 animate-slide-up">
              <span className="material-symbols-rounded sm">error</span>
              {error}
            </div>
          )}

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-sm p-10 text-center transition-all duration-200 cursor-pointer ${
              isDragging
                ? "border-accent bg-accent/5"
                : "border-border hover:border-border-hover hover:bg-bg-elevated/50"
            } ${uploading ? "pointer-events-none opacity-60" : ""}`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub,.pdf"
              onChange={handleFileSelect}
              className="hidden"
            />

            {uploading ? (
              <div className="flex flex-col items-center gap-3">
                <span className="material-symbols-rounded text-accent animate-spin !text-[36px]">
                  progress_activity
                </span>
                <p className="text-sm text-text-secondary">{status}</p>
              </div>
            ) : (
              <>
                <span className="material-symbols-rounded text-text-tertiary !text-[40px] mb-3 block">
                  upload_file
                </span>
                <p className="text-sm text-text-primary font-medium mb-1">
                  Drop your EPUB or PDF here, or click to browse
                </p>
                <p className="text-xs text-text-tertiary">
                  EPUB or PDF files up to 100MB
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
