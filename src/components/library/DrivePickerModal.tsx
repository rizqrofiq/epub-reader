"use client";

import { useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { addBook } from "@/lib/supabase/queries/books";
import { storeEpubFromBuffer } from "@/lib/epub-cache";
import { uploadEpubToCloud, QuotaError } from "@/lib/epub-cloud";
import { openDrivePicker } from "@/lib/google/drive-picker";
import { downloadDriveFile } from "@/lib/google/drive-download";
import ePub from "epubjs";

interface DrivePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function DrivePickerModal({
  isOpen,
  onClose,
  onSuccess,
}: DrivePickerModalProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);

  const handleImport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const tokenRes = await fetch("/api/drive/token");

      if (!tokenRes.ok) {
        const { error: tokenError } = await tokenRes
          .json()
          .catch(() => ({ error: null }));
        setError(
          tokenError ||
            "Google Drive access token not found. Please sign out and sign in again with Google.",
        );
        setLoading(false);
        return;
      }

      const { access_token: accessToken } = await tokenRes.json();

      setStatus("Opening Google Drive...");
      const fileResult = await openDrivePicker(accessToken);

      if (!fileResult) {
        setLoading(false);
        setStatus("");
        return;
      }

      setStatus(`Downloading "${fileResult.name}"...`);
      const arrayBuffer = await downloadDriveFile(fileResult.id, accessToken);

      setStatus("Caching file locally...");
      const fileHash = await storeEpubFromBuffer(arrayBuffer, fileResult.name);

      setStatus("Uploading to cloud...");
      let storageKey: string | null = null;
      try {
        storageKey = await uploadEpubToCloud(fileHash, arrayBuffer);
      } catch (err) {
        if (err instanceof QuotaError) {
          setError(err.message);
          setLoading(false);
          setStatus("");
          return;
        }
        console.warn("Cloud upload failed, continuing with local copy:", err);
      }

      setStatus("Extracting metadata...");
      const isPdf = fileResult.name.toLowerCase().endsWith(".pdf");
      let result;
      let bookToDestroy: ReturnType<typeof ePub> | null = null;

      if (isPdf) {
        const { loadPdf, renderPageThumbnail } =
          await import("@/lib/pdf/pdf-loader");
        const doc = await loadPdf(arrayBuffer);
        const info = await doc.getMetadata().catch(() => null);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const docInfo: any = info?.info || {};
        const coverUrl = await renderPageThumbnail(doc, 1).catch(() => null);

        setStatus("Saving to library...");
        result = await addBook(supabase, {
          title: docInfo.Title || fileResult.name.replace(/\.pdf$/i, ""),
          author: docInfo.Author || null,
          cover_url: coverUrl,
          file_hash: fileHash,
          source: "google_drive",
          format: "pdf",
          storage_key: storageKey,
          drive_file_id: fileResult.id,
          file_size: fileResult.sizeBytes,
          metadata: { pages: doc.numPages, producer: docInfo.Producer },
        });
        doc.destroy?.();
      } else {
        const book = ePub(arrayBuffer);
        bookToDestroy = book;
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
        result = await addBook(supabase, {
          title: metadata.title || fileResult.name.replace(/\.epub$/i, ""),
          author: metadata.creator || null,
          cover_url: coverUrl,
          file_hash: fileHash,
          source: "google_drive",
          format: "epub",
          storage_key: storageKey,
          drive_file_id: fileResult.id,
          file_size: fileResult.sizeBytes,
          metadata: {
            publisher: metadata.publisher,
            language: metadata.language,
            description: metadata.description,
          },
        });
      }

      bookToDestroy?.destroy();

      if (result) {
        onSuccess();
      } else {
        setError("Failed to save book metadata");
      }
    } catch (err) {
      console.error("Drive import error:", err);
      setError("Failed to import from Google Drive");
    } finally {
      setLoading(false);
      setStatus("");
    }
  }, [supabase, onSuccess]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={!loading ? onClose : undefined}
      />

      <div className="relative w-full max-w-md bg-bg-secondary border border-border rounded-sm shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between p-6 pb-0">
          <h2 className="text-lg font-semibold text-text-primary">
            Import from Google Drive
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
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

          {loading ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <span className="material-symbols-rounded text-accent animate-spin !text-[36px]">
                progress_activity
              </span>
              <p className="text-sm text-text-secondary">{status}</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-sm bg-accent/10 border border-accent/20 flex items-center justify-center">
                <span className="material-symbols-rounded text-accent !text-[32px]">
                  add_to_drive
                </span>
              </div>
              <p className="text-sm text-text-secondary text-center">
                Select an EPUB or PDF file from your Google Drive. The file will
                be downloaded and cached locally.
              </p>
              <button
                onClick={handleImport}
                className="flex items-center gap-2 px-6 py-3 rounded-sm bg-accent hover:bg-accent-hover text-bg-primary font-medium transition-all duration-200 cursor-pointer"
              >
                <span className="material-symbols-rounded sm">folder_open</span>
                Browse Google Drive
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
